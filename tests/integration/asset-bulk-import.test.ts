/**
 * Integration test for bulkImportAssets — the CSV importer's single-request
 * backend. Verifies dedupe (existing name + in-batch), free-text owner
 * resolution to a member, and server-side criticality derivation, over a live
 * Postgres connection.
 *
 * RUN: npx jest tests/integration/asset-bulk-import.test.ts
 */
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { makeRequestContext } from '../helpers/make-context';
import { bulkImportAssets } from '@/app-layer/usecases/asset';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('bulkImportAssets (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId = '';
    let userId = '';
    let ctx: ReturnType<typeof makeRequestContext>;

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `imp-${runId}`, slug: `imp-${runId}` } });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `owner-${runId}@test.com`, name: `Dana Owner ${runId}` } });
        userId = user.id;
        await prisma.tenantMembership.create({
            data: { tenantId, userId, role: Role.ADMIN, status: 'ACTIVE' },
        });
        ctx = makeRequestContext(Role.ADMIN, { userId, tenantId, tenantSlug: tenant.slug });
        // A pre-existing asset to dedupe against.
        await prisma.asset.create({ data: { tenantId, name: 'Prod DB', type: 'DATA_STORE' } });
    });

    afterAll(async () => {
        await prisma.asset.deleteMany({ where: { tenantId } }).catch(() => {});
    });

    it('dedupes by name (existing + in-batch) and derives criticality from CIA', async () => {
        const result = await bulkImportAssets(ctx, [
            { name: 'Prod DB', type: 'DATA_STORE' }, // already exists → skip
            { name: 'App Server', type: 'SYSTEM', confidentiality: 5, integrity: 1, availability: 1 },
            { name: 'app server', type: 'SYSTEM' }, // in-batch case-insensitive dup → skip
        ]);

        expect(result.created).toBe(1);
        expect(result.skipped).toBe(2);
        expect(result.errors).toHaveLength(0);

        const appServer = await prisma.asset.findFirst({ where: { tenantId, name: 'App Server' } });
        // A single ceiling dimension (C=5) keeps the asset Critical.
        expect(appServer?.criticality).toBe('CRITICAL');
    });

    it('resolves a free-text owner to a member and keeps unmatched free-text as fallback', async () => {
        const result = await bulkImportAssets(ctx, [
            { name: 'Owned By Member', type: 'SYSTEM', owner: `Dana Owner ${runId}` }, // matches member name
            { name: 'Owned By Ghost', type: 'SYSTEM', owner: 'nobody@elsewhere.test' }, // no match
        ]);
        expect(result.created).toBe(2);

        const matched = await prisma.asset.findFirst({ where: { tenantId, name: 'Owned By Member' } });
        expect(matched?.ownerUserId).toBe(userId);
        expect(matched?.owner).toBeNull(); // resolved → free-text dropped

        const unmatched = await prisma.asset.findFirst({ where: { tenantId, name: 'Owned By Ghost' } });
        expect(unmatched?.ownerUserId).toBeNull();
        expect(unmatched?.owner).toBe('nobody@elsewhere.test'); // kept as labeled fallback
    });

    it('persists the new context fields and creates the whole batch in one pass', async () => {
        const rows = Array.from({ length: 5 }, (_, n) => ({
            name: `Batch ${runId}-${n}`,
            type: 'SYSTEM' as const,
        }));
        // One row carries the full context-field set the forms now support.
        rows[0] = {
            ...rows[0],
            externalRef: 'acme/svc',
            dependencies: 'Depends on Prod DB',
            businessProcesses: 'Order fulfilment',
            retention: '7 years',
            dataResidency: 'EU',
            location: 'eu-west-1',
        } as (typeof rows)[number];

        const result = await bulkImportAssets(ctx, rows);
        expect(result.created).toBe(5);
        expect(result.createdIds).toHaveLength(5);

        const withCtx = await prisma.asset.findFirst({ where: { tenantId, name: `Batch ${runId}-0` } });
        expect(withCtx?.externalRef).toBe('acme/svc');
        expect(withCtx?.dependencies).toBe('Depends on Prod DB');
        expect(withCtx?.businessProcesses).toBe('Order fulfilment');
        expect(withCtx?.retention).toBe('7 years');
        expect(withCtx?.dataResidency).toBe('EU');
        expect(withCtx?.location).toBe('eu-west-1');
        // Every row got a distinct minted AST-N key from the batched allocation.
        const keys = await prisma.asset.findMany({
            where: { tenantId, name: { startsWith: `Batch ${runId}-` } },
            select: { key: true },
        });
        const uniqueKeys = new Set(keys.map((k) => k.key));
        expect(uniqueKeys.size).toBe(5);
    });
});
