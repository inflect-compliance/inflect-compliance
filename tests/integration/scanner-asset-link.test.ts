/**
 * Two-tenant integration tests for PR3:
 *   - Scanner-finding → asset linkage: repoRef resolves to an Asset (by
 *     externalRef/name); unresolvable targets stay unlinked; tenant isolation
 *     (tenant B never sees or links tenant A's findings).
 *   - Asset soft-delete lifecycle: delete → listWithDeleted → restore → purge
 *     round-trip.
 * Live Postgres connection.
 *
 * RUN: npx jest tests/integration/scanner-asset-link.test.ts --runInBand
 */
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { createTenantWithDek } from '@/lib/security/tenant-key-manager';
import { getPermissionsForRole } from '@/lib/permissions';
import type { RequestContext } from '@/app-layer/types';
import {
    ingestScannerRun,
    listAssetScannerFindings,
} from '@/app-layer/usecases/scanner-ingestion';
import {
    deleteAsset,
    restoreAsset,
    purgeAsset,
    listAssetsWithDeleted,
} from '@/app-layer/usecases/asset';

jest.setTimeout(30_000);
const describeFn = DB_AVAILABLE ? describe : describe.skip;

function ctxFor(tenantId: string, userId: string): RequestContext {
    return {
        requestId: `pr3-test-${tenantId}`,
        userId,
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

const sarif = (ruleId: string) => ({
    version: '2.1.0',
    runs: [{
        tool: { driver: { name: 'Semgrep', rules: [] } },
        results: [{
            ruleId,
            level: 'error',
            message: { text: 'Reflected XSS in request handler' },
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/handler.ts' }, region: { startLine: 12 } } }],
        }],
    }],
});

describeFn('scanner→asset linkage + soft-delete lifecycle (integration)', () => {
    const prisma = prismaTestClient();
    const stamp = Date.now();
    let ctxA: RequestContext;
    let ctxB: RequestContext;
    let assetA = '';
    let assetB = '';

    beforeAll(async () => {
        const a = await createTenantWithDek({ name: 'Tenant A', slug: `pr3a-${stamp}` });
        const b = await createTenantWithDek({ name: 'Tenant B', slug: `pr3b-${stamp}` });
        const ua = await prisma.user.create({ data: { email: `a-${stamp}@t.com`, name: 'A' } });
        const ub = await prisma.user.create({ data: { email: `b-${stamp}@t.com`, name: 'B' } });
        ctxA = ctxFor(a.id, ua.id);
        ctxB = ctxFor(b.id, ub.id);
        // Both tenants have an asset whose externalRef matches the same repo string.
        assetA = (await prisma.asset.create({ data: { tenantId: a.id, name: 'A App', type: 'APPLICATION', externalRef: 'acme/web' } })).id;
        assetB = (await prisma.asset.create({ data: { tenantId: b.id, name: 'B App', type: 'APPLICATION', externalRef: 'acme/web' } })).id;
    });

    it('resolves the scanned repo to THIS tenant\'s asset and isolates across tenants', async () => {
        // Tenant A scans acme/web@<sha> → finding links to A's asset.
        await ingestScannerRun(ctxA, { sarif: sarif('js/xss'), repoRef: 'acme/web@abc123', materializeFindings: false });
        const aFindings = await listAssetScannerFindings(ctxA, assetA);
        expect(aFindings.length).toBe(1);
        expect(aFindings[0].title).toContain('XSS');

        // Tenant B sees NONE of A's findings on its own asset.
        const bFindingsBefore = await listAssetScannerFindings(ctxB, assetB);
        expect(bFindingsBefore.length).toBe(0);

        // Tenant B scans the same repo string → links to B's asset only.
        await ingestScannerRun(ctxB, { sarif: sarif('js/xss'), repoRef: 'acme/web@def456', materializeFindings: false });
        const bFindings = await listAssetScannerFindings(ctxB, assetB);
        expect(bFindings.length).toBe(1);
        // A's asset-scoped list still shows exactly one (B's scan didn't touch it).
        expect((await listAssetScannerFindings(ctxA, assetA)).length).toBe(1);
    });

    it('leaves findings unlinked when the target resolves to no asset', async () => {
        await ingestScannerRun(ctxA, { sarif: sarif('js/sqli'), repoRef: 'ghost/nowhere@000', materializeFindings: false });
        const row = await prisma.scannerFinding.findFirst({ where: { tenantId: ctxA.tenantId, ruleId: 'js/sqli' } });
        expect(row).not.toBeNull();
        expect(row?.assetId).toBeNull();
    });

    it('supports the soft-delete → restore → purge lifecycle', async () => {
        const asset = await prisma.asset.create({ data: { tenantId: ctxA.tenantId, name: `Doomed ${stamp}`, type: 'SYSTEM' } });

        await deleteAsset(ctxA, asset.id);
        const withDeleted = await listAssetsWithDeleted(ctxA);
        const found = withDeleted.find((a: { id: string }) => a.id === asset.id) as { id: string; deletedAt: Date | null } | undefined;
        expect(found?.deletedAt).not.toBeNull();

        await restoreAsset(ctxA, asset.id);
        const afterRestore = (await listAssetsWithDeleted(ctxA)).find((a: { id: string }) => a.id === asset.id) as { deletedAt: Date | null } | undefined;
        expect(afterRestore?.deletedAt).toBeNull();

        // Purge requires a soft-deleted row → delete again, then hard-purge.
        await deleteAsset(ctxA, asset.id);
        await purgeAsset(ctxA, asset.id);
        const gone = await prisma.asset.findFirst({ where: { id: asset.id } });
        expect(gone).toBeNull();
    });
});
