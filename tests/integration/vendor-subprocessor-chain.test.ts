/**
 * Integration test (P3.7) for the recursive nth-party subprocessor chain.
 * Verifies transitive traversal, cycle-safety, and depth-bounding over a
 * live Postgres connection.
 *
 * RUN: npx jest tests/integration/vendor-subprocessor-chain.test.ts
 */
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DB_AVAILABLE } from './db-helper';
import { prismaTestClient } from '../helpers/db';
import { makeRequestContext } from '../helpers/make-context';
import {
    listSubprocessorChain,
    type SubprocessorChainNode,
} from '@/app-layer/usecases/vendor-audit';

const prisma = prismaTestClient();
const describeFn = DB_AVAILABLE ? describe : describe.skip;

describeFn('listSubprocessorChain (integration)', () => {
    const runId = randomUUID().slice(0, 12);
    let tenantId = '';
    let ctx: ReturnType<typeof makeRequestContext>;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        const tenant = await prisma.tenant.create({ data: { name: `sub-${runId}`, slug: `sub-${runId}` } });
        tenantId = tenant.id;
        const user = await prisma.user.create({ data: { email: `sub-${runId}@test.com`, name: 'Sub User' } });
        ctx = makeRequestContext(Role.ADMIN, { userId: user.id, tenantId, tenantSlug: tenant.slug });

        // Chain A → B → C → D (four-deep), plus a cycle D → A.
        for (const label of ['A', 'B', 'C', 'D']) {
            const v = await prisma.vendor.create({ data: { tenantId, name: `${label}-${runId}`, status: 'ACTIVE', criticality: 'MEDIUM' } });
            ids[label] = v.id;
        }
        const edge = (primary: string, sub: string) =>
            prisma.vendorRelationship.create({ data: { tenantId, primaryVendorId: ids[primary], subprocessorVendorId: ids[sub] } });
        await edge('A', 'B');
        await edge('B', 'C');
        await edge('C', 'D');
        await edge('D', 'A'); // cycle back to the root
    });

    afterAll(async () => {
        for (const del of [
            () => prisma.vendorRelationship.deleteMany({ where: { tenantId } }),
            () => prisma.vendor.deleteMany({ where: { tenantId } }),
        ]) {
            try { await del(); } catch { /* best effort */ }
        }
    });

    it('walks the transitive chain and marks the cycle back to the root', async () => {
        const tree = await listSubprocessorChain(ctx, ids.A, 6);
        expect(tree.id).toBe(ids.A);
        const b = tree.subprocessors[0];
        expect(b.id).toBe(ids.B);
        const c = b.subprocessors[0];
        expect(c.id).toBe(ids.C);
        const d = c.subprocessors[0];
        expect(d.id).toBe(ids.D);
        // D → A closes the cycle: A is an ancestor, so it's marked cyclical
        // and NOT expanded (guarding against infinite recursion).
        const backToA = d.subprocessors[0];
        expect(backToA.id).toBe(ids.A);
        expect(backToA.cyclical).toBe(true);
        expect(backToA.subprocessors).toHaveLength(0);
    });

    it('respects maxDepth', async () => {
        const shallow = await listSubprocessorChain(ctx, ids.A, 2);
        // depth 0 = A, 1 = B, 2 = C; C is at maxDepth so its children aren't expanded.
        const cNode = shallow.subprocessors[0].subprocessors[0] as SubprocessorChainNode;
        expect(cNode.id).toBe(ids.C);
        expect(cNode.subprocessors).toHaveLength(0);
    });
});
