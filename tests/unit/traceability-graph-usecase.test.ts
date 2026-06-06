/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/traceability-graph.ts`.
 *
 * Roadmap Q1 — Compliance core. Epic 47.1 traceability graph
 * builder. Mocks Prisma db, the buildTraceabilityGraph builder, and
 * runInTenantContext.
 *
 * Covers:
 *   - Forbidden when ctx.role is absent.
 *   - nodeCap defaults to DEFAULT_NODE_CAP; linkCap = nodeCap × 4.
 *   - kinds filter — if `kinds: ['control']`, only the control
 *     fetch runs; risks/assets short-circuit to `[]`.
 *   - Link relation tagging — `mitigates` for riskControl,
 *     `protects` for controlAsset, `exposes` for assetRiskLink;
 *     qualifier flows through (coverageType / exposureLevel).
 *   - Asset query filters to `status: 'ACTIVE'`.
 *   - tenantSlug fallback to '' when ctx.tenantSlug is undefined.
 */

const mockDb = {
    control: { findMany: jest.fn() },
    risk: { findMany: jest.fn() },
    asset: { findMany: jest.fn() },
    riskControl: { findMany: jest.fn() },
    controlAsset: { findMany: jest.fn() },
    assetRiskLink: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/lib/traceability-graph/build', () => ({
    buildTraceabilityGraph: jest.fn((args: any) => ({
        nodes: [...args.controls, ...args.risks, ...args.assets],
        edges: args.links,
        tenantSlug: args.tenantSlug,
        nodeCap: args.nodeCap,
    })),
}));

jest.mock('@/lib/traceability-graph/types', () => ({
    DEFAULT_NODE_CAP: 500,
}));

import { buildTraceabilityGraph } from '@/lib/traceability-graph/build';
import { getTraceabilityGraph } from '@/app-layer/usecases/traceability-graph';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
    // Reset all Prisma mocks to empty arrays per call site.
    for (const tbl of [mockDb.control, mockDb.risk, mockDb.asset, mockDb.riskControl, mockDb.controlAsset, mockDb.assetRiskLink]) {
        tbl.findMany.mockResolvedValue([]);
    }
});

const ctx = makeRequestContext('READER', { tenantSlug: 'acme' });

// ─── Auth gate ─────────────────────────────────────────────────────

describe('getTraceabilityGraph — auth', () => {
    it('throws forbidden when ctx.role is empty', async () => {
        const noRoleCtx = makeRequestContext('READER', { tenantSlug: 'acme' });
        // Force ctx.role to be falsy
        (noRoleCtx as any).role = '';
        await expect(getTraceabilityGraph(noRoleCtx)).rejects.toThrow(/Authentication required/i);
    });
});

// ─── nodeCap + linkCap ─────────────────────────────────────────────

describe('getTraceabilityGraph — cap propagation', () => {
    it('uses DEFAULT_NODE_CAP=500 + linkCap 2000 (4×) by default', async () => {
        await getTraceabilityGraph(ctx);

        const controlsCall = (mockDb.control.findMany as jest.Mock).mock.calls[0][0];
        expect(controlsCall.take).toBe(500);
        const linkCall = (mockDb.riskControl.findMany as jest.Mock).mock.calls[0][0];
        expect(linkCall.take).toBe(2000);
    });

    it('overrides nodeCap when supplied; linkCap scales with it', async () => {
        await getTraceabilityGraph(ctx, { nodeCap: 100 });

        const controlsCall = (mockDb.control.findMany as jest.Mock).mock.calls[0][0];
        expect(controlsCall.take).toBe(100);
        const linkCall = (mockDb.riskControl.findMany as jest.Mock).mock.calls[0][0];
        expect(linkCall.take).toBe(400);
    });

    it('forwards nodeCap to buildTraceabilityGraph', async () => {
        await getTraceabilityGraph(ctx, { nodeCap: 50 });
        const args = (buildTraceabilityGraph as jest.Mock).mock.calls[0][0];
        expect(args.nodeCap).toBe(50);
    });
});

// ─── kinds filter — short-circuits to [] ───────────────────────────

describe('getTraceabilityGraph — kinds filter short-circuit', () => {
    it('only fetches controls when filter is { kinds: ["control"] }', async () => {
        await getTraceabilityGraph(ctx, { filters: { kinds: ['control'] } });

        expect(mockDb.control.findMany).toHaveBeenCalledTimes(1);
        expect(mockDb.risk.findMany).not.toHaveBeenCalled();
        expect(mockDb.asset.findMany).not.toHaveBeenCalled();
        // Link tables still run regardless (the builder filters by
        // surviving endpoint set).
        expect(mockDb.riskControl.findMany).toHaveBeenCalled();
    });

    it('only fetches risks when filter is { kinds: ["risk"] }', async () => {
        await getTraceabilityGraph(ctx, { filters: { kinds: ['risk'] } });

        expect(mockDb.risk.findMany).toHaveBeenCalledTimes(1);
        expect(mockDb.control.findMany).not.toHaveBeenCalled();
        expect(mockDb.asset.findMany).not.toHaveBeenCalled();
    });

    it('fetches all three when filter is empty or missing', async () => {
        await getTraceabilityGraph(ctx);

        expect(mockDb.control.findMany).toHaveBeenCalled();
        expect(mockDb.risk.findMany).toHaveBeenCalled();
        expect(mockDb.asset.findMany).toHaveBeenCalled();
    });
});

// ─── Asset is ACTIVE-only ──────────────────────────────────────────

describe('getTraceabilityGraph — query shape', () => {
    it('asset query scopes to status: ACTIVE', async () => {
        await getTraceabilityGraph(ctx);

        const args = (mockDb.asset.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toMatchObject({ status: 'ACTIVE' });
    });

    it('explicit tenantId scope on every read (defence in depth over RLS)', async () => {
        await getTraceabilityGraph(ctx);

        for (const tbl of [mockDb.control, mockDb.risk, mockDb.asset, mockDb.riskControl, mockDb.controlAsset, mockDb.assetRiskLink]) {
            const args = tbl.findMany.mock.calls[0][0];
            expect(args.where).toMatchObject({ tenantId: ctx.tenantId });
        }
    });
});

// ─── Link tagging ──────────────────────────────────────────────────

describe('getTraceabilityGraph — link relation tagging', () => {
    it('tags each link with its semantic relation + qualifier', async () => {
        (mockDb.riskControl.findMany as jest.Mock).mockResolvedValue([
            { id: 'rc-1', riskId: 'r-1', controlId: 'c-1' },
        ]);
        (mockDb.controlAsset.findMany as jest.Mock).mockResolvedValue([
            { id: 'ca-1', controlId: 'c-1', assetId: 'a-1', coverageType: 'PRIMARY' },
        ]);
        (mockDb.assetRiskLink.findMany as jest.Mock).mockResolvedValue([
            { id: 'ar-1', assetId: 'a-1', riskId: 'r-1', exposureLevel: 'HIGH' },
        ]);

        await getTraceabilityGraph(ctx);

        const args = (buildTraceabilityGraph as jest.Mock).mock.calls[0][0];
        expect(args.links).toEqual([
            { id: 'rc:rc-1', a: 'c-1', b: 'r-1', relation: 'mitigates', qualifier: null },
            { id: 'ca:ca-1', a: 'c-1', b: 'a-1', relation: 'protects', qualifier: 'PRIMARY' },
            { id: 'ar:ar-1', a: 'a-1', b: 'r-1', relation: 'exposes', qualifier: 'HIGH' },
        ]);
    });
});

// ─── tenantSlug fallback ───────────────────────────────────────────

describe('getTraceabilityGraph — tenantSlug fallback', () => {
    it('falls back to empty string when ctx.tenantSlug is undefined', async () => {
        const noSlug = makeRequestContext('READER');
        // makeRequestContext defaults tenantSlug to 'acme'; clear it
        (noSlug as any).tenantSlug = undefined;

        await getTraceabilityGraph(noSlug);

        const args = (buildTraceabilityGraph as jest.Mock).mock.calls[0][0];
        expect(args.tenantSlug).toBe('');
    });

    it('propagates ctx.tenantSlug when set', async () => {
        await getTraceabilityGraph(ctx);
        const args = (buildTraceabilityGraph as jest.Mock).mock.calls[0][0];
        expect(args.tenantSlug).toBe('acme');
    });
});
