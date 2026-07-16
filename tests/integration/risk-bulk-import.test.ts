/**
 * Integration test for bulkImportRisks — the risk CSV importer's
 * single-request backend (PR-K). Verifies dedupe by title (existing +
 * in-batch), free-text owner resolution to a member (name OR email), and
 * the treatmentOwner fallback for an unmatched owner, over a live Postgres
 * connection.
 *
 * RUN: npx jest tests/integration/risk-bulk-import.test.ts
 */
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { makeRequestContext } from '../helpers/make-context';
import { bulkImportRisks } from '@/app-layer/usecases/risk';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('bulkImportRisks (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId = '';
    let userId = '';
    let ctx: ReturnType<typeof makeRequestContext>;

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `rimp-${runId}`, slug: `rimp-${runId}` } });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `rowner-${runId}@test.com`, name: `Rae Owner ${runId}` } });
        userId = user.id;
        await prisma.tenantMembership.create({
            data: { tenantId, userId, role: Role.ADMIN, status: 'ACTIVE' },
        });
        ctx = makeRequestContext(Role.ADMIN, { userId, tenantId, tenantSlug: tenant.slug });
        // A pre-existing risk to dedupe against.
        await prisma.risk.create({ data: { tenantId, title: 'Data breach', likelihood: 3, impact: 3, inherentScore: 9, score: 9 } });
    });

    afterAll(async () => {
        await prisma.risk.deleteMany({ where: { tenantId } }).catch(() => {});
    });

    it('dedupes by title (existing + in-batch, case-insensitive)', async () => {
        const result = await bulkImportRisks(ctx, [
            { title: 'Data breach' }, // already exists → skip
            { title: 'Supply chain outage', likelihood: 4, impact: 5 },
            { title: 'supply chain outage' }, // in-batch case-insensitive dup → skip
        ]);

        expect(result.created).toBe(1);
        expect(result.skipped).toBe(2);
        expect(result.errors).toHaveLength(0);

        const created = await prisma.risk.findFirst({ where: { tenantId, title: 'Supply chain outage' } });
        expect(created?.likelihood).toBe(4);
        expect(created?.impact).toBe(5);
    });

    it('resolves a free-text owner to a member; keeps unmatched free-text as treatmentOwner', async () => {
        const result = await bulkImportRisks(ctx, [
            { title: 'Owned By Member', owner: `Rae Owner ${runId}` }, // matches member name
            { title: 'Owned By Email', owner: `rowner-${runId}@test.com` }, // matches member email
            { title: 'Owned By Ghost', owner: 'nobody@elsewhere.test' }, // no match
        ]);
        expect(result.created).toBe(3);

        const byName = await prisma.risk.findFirst({ where: { tenantId, title: 'Owned By Member' } });
        expect(byName?.ownerUserId).toBe(userId);
        expect(byName?.treatmentOwner).toBeNull();

        const byEmail = await prisma.risk.findFirst({ where: { tenantId, title: 'Owned By Email' } });
        expect(byEmail?.ownerUserId).toBe(userId);

        const ghost = await prisma.risk.findFirst({ where: { tenantId, title: 'Owned By Ghost' } });
        expect(ghost?.ownerUserId).toBeNull();
        expect(ghost?.treatmentOwner).toBe('nobody@elsewhere.test'); // kept as labelled fallback
    });

    it('reports a per-row error for a blank title without aborting the batch', async () => {
        const result = await bulkImportRisks(ctx, [
            { title: '   ' }, // blank → error
            { title: 'Valid After Blank' },
        ]);
        expect(result.created).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(1);
    });
});
