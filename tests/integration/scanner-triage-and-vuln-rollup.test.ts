/**
 * Integration tests for PR2 backend:
 *   - updateScannerFindingStatus — analyst triage of a scanner finding.
 *   - listAssets vuln rollup — per-asset OPEN-vuln count + top severity.
 * Live Postgres connection.
 *
 * RUN: npx jest tests/integration/scanner-triage-and-vuln-rollup.test.ts
 */
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { makeRequestContext } from '../helpers/make-context';
import { updateScannerFindingStatus } from '@/app-layer/usecases/scanner-ingestion';
import { listAssets } from '@/app-layer/usecases/asset';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('PR2 backend (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId = '';
    let ctx: ReturnType<typeof makeRequestContext>;

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `pr2-${runId}`, slug: `pr2-${runId}` } });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `pr2-${runId}@test.com`, name: 'PR2 User' } });
        ctx = makeRequestContext(Role.ADMIN, { userId: user.id, tenantId, tenantSlug: tenant.slug });
    });

    afterAll(async () => {
        await prisma.scannerFinding.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.scannerRun.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.assetVulnerability.deleteMany({ where: { tenantId } }).catch(() => {});
        await prisma.asset.deleteMany({ where: { tenantId } }).catch(() => {});
    });

    it('triages a scanner finding and rejects an invalid status', async () => {
        const run = await prisma.scannerRun.create({
            data: { tenantId, source: 'semgrep', scanType: 'SAST', ranAt: new Date(), outcome: 'FAIL', findingCount: 1, ingestedVia: 'UPLOAD' },
        });
        const finding = await prisma.scannerFinding.create({
            data: { tenantId, scannerRunId: run.id, fingerprint: `fp-${runId}`, ruleId: 'r1', severity: 'HIGH', title: 'SQLi', status: 'OPEN' },
        });

        const updated = await updateScannerFindingStatus(ctx, finding.id, 'FALSE_POSITIVE');
        expect(updated.status).toBe('FALSE_POSITIVE');

        await expect(updateScannerFindingStatus(ctx, finding.id, 'NONSENSE')).rejects.toThrow(/INVALID_STATUS/);
    });

    it('listAssets folds in a per-asset OPEN-vuln rollup (count + top severity)', async () => {
        const asset = await prisma.asset.create({ data: { tenantId, name: `Vulny ${runId}`, type: 'SYSTEM' } });
        const now = new Date();
        const cve = (id: string, sev: string, score: number) =>
            prisma.cve.create({ data: { id, cvssSeverity: sev, cvssScore: score, publishedAt: now, lastModifiedAt: now, summary: `${sev} test cve` } });
        // Two global CVEs at different severities; the rollup should surface the top one.
        const cveHigh = await cve(`CVE-${runId}-1`, 'HIGH', 8.1);
        const cveCrit = await cve(`CVE-${runId}-2`, 'CRITICAL', 9.6);
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveHigh.id, status: 'OPEN', matchedVia: 'MANUAL' } });
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveCrit.id, status: 'OPEN', matchedVia: 'MANUAL' } });
        // A resolved one must NOT count toward the open rollup.
        const cveFixed = await cve(`CVE-${runId}-3`, 'LOW', 3.1);
        await prisma.assetVulnerability.create({ data: { tenantId, assetId: asset.id, cveId: cveFixed.id, status: 'MITIGATED', matchedVia: 'MANUAL' } });

        const rows = (await listAssets(ctx)) as Array<{ id: string; openVulnCount: number; maxVulnSeverity: string | null }>;
        const row = rows.find((r) => r.id === asset.id);
        expect(row?.openVulnCount).toBe(2);
        expect(row?.maxVulnSeverity).toBe('CRITICAL');
    });
});
