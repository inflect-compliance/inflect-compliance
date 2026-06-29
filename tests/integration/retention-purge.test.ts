/**
 * Integration coverage for the retention-purge job
 * (`src/lib/retention-purge.ts`).
 *
 * Exercises the real DB path: rows whose `deletedAt` is older than the
 * cutoff are hard-deleted via raw SQL; fresh soft-deletes and live
 * (deletedAt = null) rows survive. Covers:
 *   - the `days < 1` guard,
 *   - the per-model purge loop across allowlisted SOFT_DELETE_MODELS,
 *   - the `totalPurged > 0` audit-emission branch,
 *   - the no-op branch (`totalPurged === 0`, audit block skipped).
 *
 * Hits a real DB (project convention). The purge uses the prod prisma
 * singleton + `$executeRawUnsafe`, so it bypasses the soft-delete
 * extension — our plain `globalPrisma` client reads every row back
 * regardless of `deletedAt`.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { purgeSoftDeletedOlderThan } from '@/lib/retention-purge';

const globalPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DB_URL }),
});
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE_TAG = `ret-purge-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${SUITE_TAG}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const oldDate = new Date(Date.now() - 200 * DAY_MS); // well past a 90-day cutoff
const freshDate = new Date(); // just now → inside the retention window

// IDs we create + assert on individually (no exact global counts —
// the purge is DB-wide and other suites may leave soft-deleted rows).
let oldRiskId: string;
let freshRiskId: string;
let liveRiskId: string;
let oldEvidenceId: string;

describeFn('retention-purge — soft-delete purge (integration)', () => {
    beforeAll(async () => {
        await globalPrisma.tenant.upsert({
            where: { id: TENANT_ID },
            update: {},
            create: { id: TENANT_ID, name: `t ${SUITE_TAG}`, slug: SUITE_TAG },
        });

        // Risk past retention → should be purged.
        const oldRisk = await globalPrisma.risk.create({
            data: { tenantId: TENANT_ID, title: `${SUITE_TAG}-old`, deletedAt: oldDate },
        });
        oldRiskId = oldRisk.id;

        // Risk soft-deleted just now → inside window, should survive.
        const freshRisk = await globalPrisma.risk.create({
            data: { tenantId: TENANT_ID, title: `${SUITE_TAG}-fresh`, deletedAt: freshDate },
        });
        freshRiskId = freshRisk.id;

        // Risk never deleted (deletedAt null) → should survive.
        const liveRisk = await globalPrisma.risk.create({
            data: { tenantId: TENANT_ID, title: `${SUITE_TAG}-live`, deletedAt: null },
        });
        liveRiskId = liveRisk.id;

        // A second allowlisted model past retention → covers more than
        // one arm of the per-model loop.
        const oldEvidence = await globalPrisma.evidence.create({
            data: {
                tenantId: TENANT_ID,
                type: 'TEXT',
                title: `${SUITE_TAG}-old-ev`,
                status: 'DRAFT',
                deletedAt: oldDate,
            },
        });
        oldEvidenceId = oldEvidence.id;
    });

    afterAll(async () => {
        await globalPrisma.evidence.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.risk.deleteMany({ where: { tenantId: TENANT_ID } });
        await globalPrisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
            await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, TENANT_ID);
        });
        await globalPrisma.tenant.deleteMany({ where: { id: TENANT_ID } });
        await globalPrisma.$disconnect();
    });

    it('rejects a retention window shorter than one day', async () => {
        await expect(purgeSoftDeletedOlderThan(0)).rejects.toThrow(/at least 1/i);
        await expect(purgeSoftDeletedOlderThan(-5)).rejects.toThrow(/at least 1/i);
    });

    it('purges rows past the cutoff, keeps fresh + live rows, and emits an audit entry', async () => {
        const result = await purgeSoftDeletedOlderThan(90);

        // Shape of the summary.
        expect(result.totalPurged).toBeGreaterThanOrEqual(2);
        expect(result.cutoffDate).toBeInstanceOf(Date);
        expect(typeof result.durationMs).toBe('number');
        // perModel carries an entry for every allowlisted model.
        expect(result.perModel).toHaveProperty('Risk');
        expect(result.perModel).toHaveProperty('Evidence');
        expect(result.perModel.Risk).toBeGreaterThanOrEqual(1);
        expect(result.perModel.Evidence).toBeGreaterThanOrEqual(1);

        // Old rows are gone.
        expect(await globalPrisma.risk.findUnique({ where: { id: oldRiskId } })).toBeNull();
        expect(await globalPrisma.evidence.findUnique({ where: { id: oldEvidenceId } })).toBeNull();

        // Fresh soft-delete + live rows survive.
        expect(await globalPrisma.risk.findUnique({ where: { id: freshRiskId } })).not.toBeNull();
        expect(await globalPrisma.risk.findUnique({ where: { id: liveRiskId } })).not.toBeNull();

        // The totalPurged > 0 branch should have written a JOB audit row
        // for the first tenant in the DB. Best-effort + tenant-agnostic,
        // so assert only that *a* PURGE_EXECUTED row now exists.
        const auditRows: Array<{ n: bigint }> = await globalPrisma.$queryRawUnsafe(
            `SELECT COUNT(*)::bigint AS n FROM "AuditLog" WHERE "action" = 'PURGE_EXECUTED'`,
        );
        expect(Number(auditRows[0].n)).toBeGreaterThanOrEqual(1);
    });

    it('is a no-op when nothing is older than the cutoff (audit block skipped)', async () => {
        // A 100000-day window → cutoff far in the past → nothing matches.
        const result = await purgeSoftDeletedOlderThan(100000);
        expect(result.totalPurged).toBe(0);
        // Every per-model count is zero.
        for (const count of Object.values(result.perModel)) {
            expect(count).toBe(0);
        }
        // The fresh + live rows are still present (proving the wide
        // window didn't touch in-window data either).
        expect(await globalPrisma.risk.findUnique({ where: { id: freshRiskId } })).not.toBeNull();
        expect(await globalPrisma.risk.findUnique({ where: { id: liveRiskId } })).not.toBeNull();
    });
});
