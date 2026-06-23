/**
 * Integration tests for the vendor assessment state-machine usecases —
 * coverage wave A.
 *
 * Raises branch coverage of `src/app-layer/usecases/vendor.ts` across the
 * assessment lifecycle + every thrown error class:
 *   - startVendorAssessment   (template-not-found, happy path)
 *   - saveAssessmentAnswers   (not-found, non-draft reject, null-template
 *                              reject, question-found vs question-missing
 *                              point branches, scoring + audit)
 *   - submitVendorAssessment  (not-found/non-draft, happy DRAFT→IN_REVIEW)
 *   - decideVendorAssessment  (APPROVED branch, REJECTED branch, notes vs
 *                              null-notes, not-found/non-IN_REVIEW)
 */
import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors/types';
import {
    startVendorAssessment,
    saveAssessmentAnswers,
    submitVendorAssessment,
    decideVendorAssessment,
} from '@/app-layer/usecases/vendor';

const globalPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE = `vassess-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${SUITE}`;
const TEMPLATE_KEY = `tpl-${SUITE}`;

let admin: { userId: string };
let editor: { userId: string };
let reader: { userId: string };
let TEMPLATE_ID = '';
let Q1 = '';
let Q2 = '';
let VENDOR_ID = '';

async function makeUser(label: string): Promise<{ userId: string }> {
    const email = `${SUITE}-${label}@example.test`;
    const u = await globalPrisma.user.create({
        data: { email, emailHash: hashForLookup(email) },
    });
    return { userId: u.id };
}

function ctxAs(role: Role, userId: string) {
    return makeRequestContext(role, { userId, tenantId: TENANT_ID });
}

async function clearAudit() {
    await globalPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, TENANT_ID);
    });
}

describeFn('vendor assessment lifecycle — integration', () => {
    beforeAll(async () => {
        await globalPrisma.tenant.upsert({
            where: { id: TENANT_ID },
            update: {},
            create: { id: TENANT_ID, name: `t ${SUITE}`, slug: SUITE },
        });
        admin = await makeUser('admin');
        editor = await makeUser('editor');
        reader = await makeUser('reader');
        await globalPrisma.tenantMembership.createMany({
            data: [
                { tenantId: TENANT_ID, userId: admin.userId, role: Role.ADMIN, status: MembershipStatus.ACTIVE },
                { tenantId: TENANT_ID, userId: editor.userId, role: Role.EDITOR, status: MembershipStatus.ACTIVE },
                { tenantId: TENANT_ID, userId: reader.userId, role: Role.READER, status: MembershipStatus.ACTIVE },
            ],
        });

        // Global questionnaire template with two weighted YES/NO questions.
        const tpl = await globalPrisma.questionnaireTemplate.create({
            data: {
                key: TEMPLATE_KEY,
                name: 'Security Baseline',
                isGlobal: true,
                questions: {
                    create: [
                        { section: 'A', prompt: 'Encryption at rest?', answerType: 'YES_NO', weight: 1, riskPointsJson: { YES: 0, NO: 10 }, sortOrder: 0 },
                        { section: 'A', prompt: 'MFA enforced?', answerType: 'YES_NO', weight: 1, riskPointsJson: { YES: 0, NO: 10 }, sortOrder: 1 },
                    ],
                },
            },
            include: { questions: { orderBy: { sortOrder: 'asc' } } },
        });
        TEMPLATE_ID = tpl.id;
        Q1 = tpl.questions[0].id;
        Q2 = tpl.questions[1].id;
    });

    beforeEach(async () => {
        const v = await globalPrisma.vendor.create({
            data: { tenantId: TENANT_ID, name: `Vendor ${randomUUID().slice(0, 6)}`, criticality: 'MEDIUM' },
        });
        VENDOR_ID = v.id;
    });

    afterEach(async () => {
        await globalPrisma.vendorAssessmentAnswer.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.vendorAssessment.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.vendor.deleteMany({ where: { tenantId: TENANT_ID } });
        await clearAudit();
    });

    afterAll(async () => {
        await globalPrisma.questionnaireQuestion.deleteMany({ where: { templateId: TEMPLATE_ID } });
        await globalPrisma.questionnaireTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
        await globalPrisma.tenantMembership.deleteMany({ where: { tenantId: TENANT_ID } });
        await clearAudit();
        await globalPrisma.user.deleteMany({ where: { id: { in: [admin.userId, editor.userId, reader.userId] } } });
        await globalPrisma.tenant.deleteMany({ where: { id: TENANT_ID } });
        await globalPrisma.$disconnect();
    });

    const adminCtx = () => ctxAs(Role.ADMIN, admin.userId);
    const editorCtx = () => ctxAs(Role.EDITOR, editor.userId);

    async function startAssessment() {
        return startVendorAssessment(adminCtx(), VENDOR_ID, TEMPLATE_KEY);
    }

    // ── startVendorAssessment ────────────────────────────────────

    it('startVendorAssessment creates a DRAFT + audit', async () => {
        const a = await startAssessment();
        expect(a.status).toBe('DRAFT');
        const audit = await globalPrisma.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: 'VENDOR_ASSESSMENT_STARTED' },
        });
        expect(audit).toBeTruthy();
    });

    it('startVendorAssessment throws NotFoundError for an unknown template', async () => {
        await expect(startVendorAssessment(adminCtx(), VENDOR_ID, 'no-such-template')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('startVendorAssessment rejects a READER (assertCanRunAssessment)', async () => {
        await expect(startVendorAssessment(ctxAs(Role.READER, reader.userId), VENDOR_ID, TEMPLATE_KEY)).rejects.toBeInstanceOf(ForbiddenError);
    });

    // ── saveAssessmentAnswers ────────────────────────────────────

    it('saveAssessmentAnswers scores answers (question-found point branch)', async () => {
        const a = await startAssessment();
        const res = await saveAssessmentAnswers(editorCtx(), a.id, [
            { questionId: Q1, answerJson: 'NO' },  // 10 pts
            { questionId: Q2, answerJson: 'YES' }, // 0 pts
        ]);
        expect(res.saved).toBe(2);
        // weightedSum=10, maxPossible=20 → 50% → MEDIUM
        expect(res.score).toBe(10);
        expect(res.riskRating).toBe('MEDIUM');
        const audit = await globalPrisma.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: 'VENDOR_ASSESSMENT_SCORED' },
        });
        expect(audit).toBeTruthy();
    });

    it('saveAssessmentAnswers scores an unmapped answer value as 0 (mapping[key] ?? 0 branch)', async () => {
        const a = await startAssessment();
        // 'MAYBE' is not a key in riskPointsJson ({YES,NO}) → computeAnswerPoints
        // returns 0 via the nullish-coalescing branch.
        const res = await saveAssessmentAnswers(editorCtx(), a.id, [
            { questionId: Q1, answerJson: 'MAYBE' },
        ]);
        expect(res.saved).toBe(1);
        expect(res.score).toBe(0);
        expect(res.riskRating).toBe('LOW');
    });

    it('saveAssessmentAnswers throws NotFoundError for an unknown assessment', async () => {
        await expect(saveAssessmentAnswers(editorCtx(), 'nope', [])).rejects.toBeInstanceOf(NotFoundError);
    });

    it('saveAssessmentAnswers rejects a non-DRAFT assessment', async () => {
        const a = await startAssessment();
        await submitVendorAssessment(adminCtx(), a.id); // → IN_REVIEW
        await expect(saveAssessmentAnswers(editorCtx(), a.id, [{ questionId: Q1, answerJson: 'NO' }]))
            .rejects.toBeInstanceOf(ValidationError);
    });

    it('saveAssessmentAnswers rejects when the legacy template is null (G-3 path)', async () => {
        // Create an assessment row with NO templateId — the getById include
        // leaves `template` null, hitting the loud-reject branch.
        const a = await globalPrisma.vendorAssessment.create({
            data: { tenantId: TENANT_ID, vendorId: VENDOR_ID, requestedByUserId: admin.userId, status: 'DRAFT' },
        });
        await expect(saveAssessmentAnswers(editorCtx(), a.id, [{ questionId: Q1, answerJson: 'NO' }]))
            .rejects.toBeInstanceOf(ValidationError);
    });

    // ── submitVendorAssessment ───────────────────────────────────

    it('submitVendorAssessment moves DRAFT→IN_REVIEW + audit', async () => {
        const a = await startAssessment();
        const submitted = await submitVendorAssessment(adminCtx(), a.id);
        expect(submitted.status).toBe('IN_REVIEW');
        const audit = await globalPrisma.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: 'VENDOR_ASSESSMENT_SUBMITTED' },
        });
        expect(audit).toBeTruthy();
    });

    it('submitVendorAssessment throws NotFoundError when not in DRAFT', async () => {
        const a = await startAssessment();
        await submitVendorAssessment(adminCtx(), a.id);
        // already IN_REVIEW → repo.submit returns null → notFound
        await expect(submitVendorAssessment(adminCtx(), a.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    // ── decideVendorAssessment ───────────────────────────────────

    it('decideVendorAssessment APPROVED branch with notes', async () => {
        const a = await startAssessment();
        await submitVendorAssessment(adminCtx(), a.id);
        const decided = await decideVendorAssessment(adminCtx(), a.id, 'APPROVED', 'Looks good <script>x</script>');
        expect(decided.status).toBe('APPROVED');
        const audit = await globalPrisma.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: 'VENDOR_ASSESSMENT_APPROVED' },
        });
        expect(audit).toBeTruthy();
    });

    it('decideVendorAssessment REJECTED branch with null notes', async () => {
        const a = await startAssessment();
        await submitVendorAssessment(adminCtx(), a.id);
        const decided = await decideVendorAssessment(adminCtx(), a.id, 'REJECTED', null);
        expect(decided.status).toBe('REJECTED');
        const audit = await globalPrisma.auditLog.findFirst({
            where: { tenantId: TENANT_ID, action: 'VENDOR_ASSESSMENT_REJECTED' },
        });
        expect(audit).toBeTruthy();
    });

    it('decideVendorAssessment throws NotFoundError when not in IN_REVIEW', async () => {
        const a = await startAssessment(); // still DRAFT
        await expect(decideVendorAssessment(adminCtx(), a.id, 'APPROVED')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('decideVendorAssessment rejects a non-admin (assertCanApproveAssessment)', async () => {
        const a = await startAssessment();
        await submitVendorAssessment(adminCtx(), a.id);
        await expect(decideVendorAssessment(editorCtx(), a.id, 'APPROVED')).rejects.toBeInstanceOf(ForbiddenError);
    });
});
