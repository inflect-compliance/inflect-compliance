/**
 * PR-W integration tests:
 *   - listAssetsWithDeleted — scopes to ONLY soft-deleted rows + honours filters.
 *   - listAssets vuln rollup — folds OPEN scanner findings into the count +
 *     max-severity (not just CVE `AssetVulnerability`).
 *   - max-severity ordering is NULLS-LAST — a null-scored CVE must not outrank
 *     a real CRITICAL and grey the badge.
 * Live Postgres connection.
 *
 * RUN: npx jest tests/integration/deleted-assets-and-vuln-fold.test.ts
 */
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { makeRequestContext } from '../helpers/make-context';
import { listAssets, listAssetsWithDeleted, deleteAsset } from '@/app-layer/usecases/asset';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('PR-W — deleted-asset scope + scanner-inclusive vuln rollup (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId = '';
    let ctx: ReturnType<typeof makeRequestContext>;

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `prw-${runId}`, slug: `prw-${runId}` } });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `prw-${runId}@test.com`, name: 'PRW User' } });
        ctx = makeRequestContext(Role.ADMIN, { userId: user.id, tenantId, tenantSlug: tenant.slug });
    });

    afterAll(async () => {
        await prisma.scannerFinding.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.scannerRun.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.assetVulnerability.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.asset.deleteMany({ where: { tenantId } }).catch(() => {});
    });

    const mkRun = () =>
        prisma.scannerRun.create({
            data: { tenantId, source: 'semgrep', scanType: 'SAST', ranAt: new Date(), outcome: 'FAIL', findingCount: 1, ingestedVia: 'UPLOAD' },
        });

    it('listAssetsWithDeleted returns ONLY soft-deleted rows, honouring the q filter', async () => {
        const live = await prisma.asset.create({ data: { tenantId, name: `Live ${runId}`, type: 'SYSTEM' } });
        const gone = await prisma.asset.create({ data: { tenantId, name: `Gone ${runId}`, type: 'SYSTEM' } });
        const goneOther = await prisma.asset.create({ data: { tenantId, name: `Other ${runId}`, type: 'SYSTEM' } });
        await deleteAsset(ctx, gone.id);
        await deleteAsset(ctx, goneOther.id);

        const deleted = (await listAssetsWithDeleted(ctx)) as Array<{ id: string; deletedAt: string | null }>;
        const ids = deleted.map((r) => r.id);
        expect(ids).toContain(gone.id);
        expect(ids).toContain(goneOther.id);
        // The live asset must NOT leak into the deleted view (the pre-fix bug).
        expect(ids).not.toContain(live.id);
        expect(deleted.every((r) => r.deletedAt !== null)).toBe(true);

        // Filters are honoured: q narrows to a single deleted row.
        const filtered = (await listAssetsWithDeleted(ctx, { q: `Gone ${runId}` })) as Array<{ id: string }>;
        expect(filtered.map((r) => r.id)).toEqual([gone.id]);
    });

    it('folds OPEN scanner findings into the per-asset open-vuln count + max severity', async () => {
        const asset = await prisma.asset.create({ data: { tenantId, name: `Scanned ${runId}`, type: 'SYSTEM' } });
        const run = await mkRun();
        // Two OPEN scanner findings (no CVE at all) + one resolved (must not count).
        await prisma.scannerFinding.create({ data: { tenantId, scannerRunId: run.id, assetId: asset.id, fingerprint: `sf-${runId}-a`, ruleId: 'r1', severity: 'MEDIUM', title: 'x', status: 'OPEN' } });
        await prisma.scannerFinding.create({ data: { tenantId, scannerRunId: run.id, assetId: asset.id, fingerprint: `sf-${runId}-b`, ruleId: 'r2', severity: 'CRITICAL', title: 'y', status: 'OPEN' } });
        await prisma.scannerFinding.create({ data: { tenantId, scannerRunId: run.id, assetId: asset.id, fingerprint: `sf-${runId}-c`, ruleId: 'r3', severity: 'HIGH', title: 'z', status: 'FIXED' } });

        const rows = (await listAssets(ctx)) as Array<{ id: string; openVulnCount: number; maxVulnSeverity: string | null }>;
        const row = rows.find((r) => r.id === asset.id);
        // Column no longer shows "—"/0 for a scanner-only asset (the pre-fix bug).
        expect(row?.openVulnCount).toBe(2);
        expect(row?.maxVulnSeverity).toBe('CRITICAL');
    });

    it('folds scanner severity ACROSS the CVE source (worst of both wins)', async () => {
        const asset = await prisma.asset.create({ data: { tenantId, name: `Both ${runId}`, type: 'SYSTEM' } });
        const now = new Date();
        const cveHigh = await prisma.cve.create({ data: { id: `CVE-${runId}-H`, cvssSeverity: 'HIGH', cvssScore: 8.0, publishedAt: now, lastModifiedAt: now, summary: 'high' } });
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveHigh.id, status: 'OPEN', matchedVia: 'MANUAL' } });
        const run = await mkRun();
        await prisma.scannerFinding.create({ data: { tenantId, scannerRunId: run.id, assetId: asset.id, fingerprint: `sf-${runId}-crit`, ruleId: 'r', severity: 'CRITICAL', title: 'c', status: 'OPEN' } });

        const rows = (await listAssets(ctx)) as Array<{ id: string; openVulnCount: number; maxVulnSeverity: string | null }>;
        const row = rows.find((r) => r.id === asset.id);
        expect(row?.openVulnCount).toBe(2); // 1 CVE + 1 scanner
        expect(row?.maxVulnSeverity).toBe('CRITICAL'); // scanner CRITICAL beats CVE HIGH
    });

    it('orders max-severity NULLS-LAST — a null-scored CVE does not outrank a real CRITICAL', async () => {
        const asset = await prisma.asset.create({ data: { tenantId, name: `Nulls ${runId}`, type: 'SYSTEM' } });
        const now = new Date();
        // A null-scored, null-severity CVE (the kind that used to sort FIRST under
        // DESC NULLS FIRST and grey the badge)…
        const cveNull = await prisma.cve.create({ data: { id: `CVE-${runId}-N`, cvssSeverity: null, cvssScore: null, publishedAt: now, lastModifiedAt: now, summary: 'unknown' } });
        // …alongside a real CRITICAL.
        const cveCrit = await prisma.cve.create({ data: { id: `CVE-${runId}-C`, cvssSeverity: 'CRITICAL', cvssScore: 9.5, publishedAt: now, lastModifiedAt: now, summary: 'crit' } });
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveNull.id, status: 'OPEN', matchedVia: 'MANUAL' } });
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveCrit.id, status: 'OPEN', matchedVia: 'MANUAL' } });

        const rows = (await listAssets(ctx)) as Array<{ id: string; maxVulnSeverity: string | null }>;
        const row = rows.find((r) => r.id === asset.id);
        expect(row?.maxVulnSeverity).toBe('CRITICAL');
    });
});
