/**
 * Integration coverage for `src/app-layer/usecases/traceability-graph.ts`.
 *
 * DB-backed: seeds Controls/Risks/Assets + the three link tables, then
 * runs the usecase through runInTenantContext (prisma singleton).
 *
 * Branches:
 *   - !ctx.role → forbidden.
 *   - no kinds filter → all three node kinds fetched + every link.
 *   - kinds filter excluding a kind → that kind's findMany short-circuits
 *     to [] (the Promise.resolve arm).
 *   - link assembly tags mitigates/protects/exposes.
 *   - nodeCap override path.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { makeRequestContext } from '../helpers/make-context';
import { getTraceabilityGraph } from '@/app-layer/usecases/traceability-graph';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const SUITE = `tg-${randomUUID().slice(0, 8)}`;
const TENANT = `t-${SUITE}`;
const ctx = makeRequestContext('ADMIN', { tenantId: TENANT, tenantSlug: SUITE });

let controlId: string;
let riskId: string;
let assetId: string;

describeFn('getTraceabilityGraph (real DB)', () => {
    beforeAll(async () => {
        await prisma.$connect();
        await prisma.tenant.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: SUITE, slug: SUITE } });
        const control = await prisma.control.create({ data: { tenantId: TENANT, name: 'Ctrl', code: 'C-1' } });
        controlId = control.id;
        const risk = await prisma.risk.create({ data: { tenantId: TENANT, title: 'Risk', score: 12, category: 'cat' } });
        riskId = risk.id;
        const asset = await prisma.asset.create({ data: { tenantId: TENANT, name: 'Asset', type: 'SYSTEM', status: 'ACTIVE' } });
        assetId = asset.id;
        await prisma.riskControl.create({ data: { tenantId: TENANT, riskId, controlId } });
        await prisma.controlAsset.create({ data: { tenantId: TENANT, controlId, assetId } });
        await prisma.assetRiskLink.create({ data: { tenantId: TENANT, assetId, riskId } });
    });

    afterAll(async () => {
        await prisma.riskControl.deleteMany({ where: { tenantId: TENANT } });
        await prisma.controlAsset.deleteMany({ where: { tenantId: TENANT } });
        await prisma.assetRiskLink.deleteMany({ where: { tenantId: TENANT } });
        await prisma.control.deleteMany({ where: { tenantId: TENANT } });
        await prisma.risk.deleteMany({ where: { tenantId: TENANT } });
        await prisma.asset.deleteMany({ where: { tenantId: TENANT } });
        await prisma.tenant.deleteMany({ where: { id: TENANT } });
        await prisma.$disconnect();
    });

    it('throws forbidden when the context has no role', async () => {
        const noRole = makeRequestContext('ADMIN', { tenantId: TENANT, tenantSlug: SUITE, role: undefined as never });
        await expect(getTraceabilityGraph(noRole)).rejects.toThrow(/Authentication required/);
    });

    it('builds a full graph (all kinds + every link relation) by default', async () => {
        const graph = await getTraceabilityGraph(ctx);
        const kinds = new Set(graph.nodes.map((n) => n.kind));
        expect(kinds.has('control')).toBe(true);
        expect(kinds.has('risk')).toBe(true);
        expect(kinds.has('asset')).toBe(true);
        const relations = new Set(graph.edges.map((e) => e.relation));
        expect(relations.has('mitigates')).toBe(true);
        expect(relations.has('protects')).toBe(true);
        expect(relations.has('exposes')).toBe(true);
    });

    it('short-circuits excluded kinds when a kinds filter is supplied', async () => {
        const graph = await getTraceabilityGraph(ctx, { filters: { kinds: ['control'] } });
        const kinds = new Set(graph.nodes.map((n) => n.kind));
        expect(kinds.has('control')).toBe(true);
        // risk + asset nodes excluded — their findMany resolved to [].
        expect(kinds.has('risk')).toBe(false);
        expect(kinds.has('asset')).toBe(false);
    });

    it('honours a nodeCap override without error', async () => {
        const graph = await getTraceabilityGraph(ctx, { nodeCap: 1 });
        expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    });
});
