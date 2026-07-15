/**
 * Integration (live-DB) test for the policy-attestation loop (Prompt-1).
 *
 * Covers attest (happy + idempotent + non-PUBLISHED refused), the required-
 * acknowledgement campaign (assign → roster % complete), and the shared
 * coverage predicate gating (a PUBLISHED policy counts in coverageSummary; a
 * DRAFT does not).
 *
 * Hits a real DB (project convention).
 */
import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import { createPolicy, getPolicy, publishPolicy } from '@/app-layer/usecases/policy';
import {
    attestPolicy,
    requirePolicyAcknowledgement,
    getPolicyAcknowledgementRoster,
    getPolicyAttestation,
} from '@/app-layer/usecases/policy-attestation';
import { coverageSummary } from '@/app-layer/usecases/traceability';

const globalPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE_TAG = `pol-att-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${SUITE_TAG}`;

let adminUserId: string;
let readerUserId: string;
let admin: ReturnType<typeof makeRequestContext>;
let reader: ReturnType<typeof makeRequestContext>;
let publishedPolicyId: string;
let draftPolicyId: string;

async function makeUser(label: string, role: Role): Promise<string> {
    const email = `${SUITE_TAG}-${label}@example.test`;
    const u = await globalPrisma.user.create({ data: { email, emailHash: hashForLookup(email) } });
    await globalPrisma.tenantMembership.create({
        data: { tenantId: TENANT_ID, userId: u.id, role, status: MembershipStatus.ACTIVE },
    });
    return u.id;
}

describeFn('policy attestation loop (integration)', () => {
    beforeAll(async () => {
        await globalPrisma.tenant.upsert({
            where: { id: TENANT_ID },
            update: {},
            create: { id: TENANT_ID, name: `t ${SUITE_TAG}`, slug: SUITE_TAG },
        });
        adminUserId = await makeUser('admin', Role.ADMIN);
        readerUserId = await makeUser('reader', Role.READER);
        admin = makeRequestContext('ADMIN', { tenantId: TENANT_ID, tenantSlug: SUITE_TAG, userId: adminUserId });
        reader = makeRequestContext('READER', { tenantId: TENANT_ID, tenantSlug: SUITE_TAG, userId: readerUserId });

        // A PUBLISHED policy (via the emergency bypass to skip the approval dance).
        const published = await createPolicy(admin, { title: `Acceptable Use ${SUITE_TAG}`, content: '# Body' });
        const full = await getPolicy(admin, published.id);
        const versionId = full.currentVersion?.id ?? full.versions[0].id;
        await publishPolicy(admin, published.id, versionId, { bypassApprovalReason: 'integration-test' });
        publishedPolicyId = published.id;

        // A DRAFT policy (never published).
        const draft = await createPolicy(admin, { title: `Draft ${SUITE_TAG}`, content: '# Draft' });
        draftPolicyId = draft.id;
    });

    afterAll(async () => {
        await globalPrisma.notification.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
        await globalPrisma.policyApproval.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
        // PolicyAcknowledgement + PolicyAcknowledgementAssignment cascade on version delete.
        await globalPrisma.policyVersion.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.policy.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
            await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, TENANT_ID);
            await tx.$executeRawUnsafe(`DELETE FROM "TenantMembership" WHERE "tenantId" = $1`, TENANT_ID);
        });
        await globalPrisma.user.deleteMany({ where: { id: { in: [adminUserId, readerUserId] } } });
        await globalPrisma.tenant.deleteMany({ where: { id: TENANT_ID } });
        await globalPrisma.$disconnect();
    });

    it('a DRAFT policy cannot be attested', async () => {
        await expect(attestPolicy(reader, draftPolicyId)).rejects.toThrow(/Only PUBLISHED/);
    });

    it('any member can attest a PUBLISHED policy (created: true), idempotently (created: false)', async () => {
        const first = await attestPolicy(reader, publishedPolicyId);
        expect(first.created).toBe(true);
        expect(first.userId).toBe(readerUserId);

        const again = await attestPolicy(reader, publishedPolicyId);
        expect(again.created).toBe(false);
        expect(again.acknowledgementId).toBe(first.acknowledgementId);

        const status = await getPolicyAttestation(reader, publishedPolicyId);
        expect(status?.userId).toBe(readerUserId);
    });

    it('a required-acknowledgement campaign tracks % complete and who is outstanding', async () => {
        // Require all active members (admin + reader) to acknowledge.
        const res = await requirePolicyAcknowledgement(admin, publishedPolicyId, { audience: { type: 'all' } });
        expect(res.assignedCount).toBe(2);

        const roster = await getPolicyAcknowledgementRoster(admin, publishedPolicyId);
        expect(roster.assignedCount).toBe(2);
        // reader acknowledged in the previous test; admin has not.
        expect(roster.acknowledgedCount).toBe(1);
        expect(roster.pctComplete).toBe(50);
        const adminEntry = roster.entries.find((e) => e.userId === adminUserId);
        expect(adminEntry?.required).toBe(true);
        expect(adminEntry?.acknowledgedAt).toBeNull();
    });

    it('coverageSummary counts the PUBLISHED policy but not the DRAFT', async () => {
        const cov = (await coverageSummary(admin)) as { totalPolicies: number };
        // Exactly one policy counts: the published one (the draft is excluded).
        expect(cov.totalPolicies).toBe(1);
    });
});
