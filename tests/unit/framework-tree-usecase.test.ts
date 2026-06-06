/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/framework/tree.ts`.
 *
 * Roadmap Q1 — Compliance core. Epic 46 framework tree + Epic 46.4
 * reorder. Mocks the prisma client (frameworks are global), the
 * tenant-scoped db (overlay + control links), tree builders, audit
 * emitter, and policy gates.
 *
 * Covers:
 *   - getFrameworkTree — version-pinned vs latest lookup, notFound,
 *     overlay short-circuit when no requirements, control links
 *     grouped per requirement.
 *   - reorderFrameworkRequirements — admin gate, framework notFound,
 *     unknown-ids rejection, duplicate-id rejection, partial-overlay
 *     rejection, audit emission with count summary.
 */

const mockTenantDb = {
    frameworkRequirementOrder: { findMany: jest.fn(), upsert: jest.fn() },
    controlRequirementLink: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockTenantDb)),
}));

jest.mock('@/lib/prisma', () => ({
    prisma: {
        framework: { findUnique: jest.fn(), findFirst: jest.fn() },
        frameworkRequirement: { findMany: jest.fn() },
    },
}));

jest.mock('@/lib/framework-tree/build', () => ({
    buildFrameworkTree: jest.fn((_fw: any, _reqs: any) => ({
        framework: _fw,
        nodes: [{ id: 'n-1', children: [] }],
    })),
}));

jest.mock('@/lib/framework-tree/compliance', () => ({
    decorateTreeWithCompliance: jest.fn((nodes: any) =>
        nodes.map((n: any) => ({ ...n, decorated: true })),
    ),
}));

jest.mock('@/lib/framework-tree/reorder', () => ({
    applySortOrderOverlay: jest.fn((reqs: any[], overlay: Map<string, number>) =>
        // mimic: when overlay has an entry, swap order via index marker
        reqs.map((r) => ({ ...r, _overlay: overlay.get(r.id) ?? null })),
    ),
    findUnknownRequirementIds: jest.fn(),
    flattenOrderedSectionsToOverlay: jest.fn((sections: any[]) => {
        const out: Array<{ requirementId: string; sortOrder: number }> = [];
        let idx = 0;
        for (const s of sections) {
            for (const id of s.requirementIds) {
                out.push({ requirementId: id, sortOrder: idx++ });
            }
        }
        return out;
    }),
}));

jest.mock('@/app-layer/events/audit', () => ({
    logEvent: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { logEvent } from '@/app-layer/events/audit';
import {
    buildFrameworkTree,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from '@/lib/framework-tree/build';
import {
    decorateTreeWithCompliance,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from '@/lib/framework-tree/compliance';
import { findUnknownRequirementIds } from '@/lib/framework-tree/reorder';
import {
    getFrameworkTree,
    reorderFrameworkRequirements,
} from '@/app-layer/usecases/framework/tree';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
    (findUnknownRequirementIds as jest.Mock).mockReturnValue([]);
});

const adminCtx = makeRequestContext('ADMIN');
const editorCtx = makeRequestContext('EDITOR');
const readerCtx = makeRequestContext('READER');

// ─── getFrameworkTree ──────────────────────────────────────────────

describe('getFrameworkTree', () => {
    it('uses version-pinned lookup when version is supplied', async () => {
        (prisma.framework.findUnique as jest.Mock).mockResolvedValue({
            id: 'f-1', key: 'iso', name: 'ISO', version: '2022', kind: 'COMPLIANCE', description: '',
        });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);

        await getFrameworkTree(readerCtx, 'iso', '2022');

        expect(prisma.framework.findUnique).toHaveBeenCalledWith({
            where: { key_version: { key: 'iso', version: '2022' } },
        });
        expect(prisma.framework.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to findFirst when no version supplied', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({
            id: 'f-1', key: 'iso', name: 'ISO', version: '2022', kind: 'COMPLIANCE', description: '',
        });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);

        await getFrameworkTree(readerCtx, 'iso');

        expect(prisma.framework.findFirst).toHaveBeenCalled();
    });

    it('throws notFound when framework is missing', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(getFrameworkTree(readerCtx, 'nope')).rejects.toThrow(/Framework not found/i);
    });

    it('skips overlay + links queries when there are zero requirements', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({
            id: 'f-1', key: 'iso', name: 'ISO', version: '2022', kind: 'COMPLIANCE', description: '',
        });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);

        await getFrameworkTree(readerCtx, 'iso');

        // No requirements → no overlay or links queries
        expect(mockTenantDb.frameworkRequirementOrder.findMany).not.toHaveBeenCalled();
        expect(mockTenantDb.controlRequirementLink.findMany).not.toHaveBeenCalled();
    });

    it('groups control links per requirementId before decorating the tree', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({
            id: 'f-1', key: 'iso', name: 'ISO', version: '2022', kind: 'COMPLIANCE', description: '',
        });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1' }, { id: 'r-2' },
        ]);
        (mockTenantDb.frameworkRequirementOrder.findMany as jest.Mock).mockResolvedValue([]);
        (mockTenantDb.controlRequirementLink.findMany as jest.Mock).mockResolvedValue([
            { requirementId: 'r-1', control: { status: 'IMPLEMENTED', applicability: 'APPLICABLE' } },
            { requirementId: 'r-1', control: { status: 'IN_PROGRESS', applicability: 'APPLICABLE' } },
            { requirementId: 'r-2', control: { status: 'NOT_STARTED', applicability: 'APPLICABLE' } },
        ]);

        const res = await getFrameworkTree(readerCtx, 'iso');

        // decorateTreeWithCompliance receives a Map<requirementId, ControlForCompliance[]>
        const decorateCall = (decorateTreeWithCompliance as jest.Mock).mock.calls[0];
        const controlsByReqId: Map<string, any[]> = decorateCall[1];
        expect(controlsByReqId.get('r-1')).toHaveLength(2);
        expect(controlsByReqId.get('r-2')).toHaveLength(1);
        // decorated nodes propagate through
        expect(res.nodes[0]).toHaveProperty('decorated', true);
    });
});

// ─── reorderFrameworkRequirements ──────────────────────────────────

describe('reorderFrameworkRequirements', () => {
    it('rejects EDITOR (admin gate)', async () => {
        await expect(reorderFrameworkRequirements(editorCtx, 'iso', [])).rejects.toBeDefined();
        expect(prisma.framework.findFirst).not.toHaveBeenCalled();
    });

    it('throws notFound when framework is missing', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(reorderFrameworkRequirements(adminCtx, 'nope', [])).rejects.toThrow(/Framework not found/i);
    });

    it('rejects payload with unknown requirement ids', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([{ id: 'r-1' }]);
        (findUnknownRequirementIds as jest.Mock).mockReturnValue(['r-ghost', 'r-other']);

        await expect(reorderFrameworkRequirements(adminCtx, 'iso', [
            { section: 'A', requirementIds: ['r-ghost'] },
        ] as any)).rejects.toThrow(/2 unknown requirement/i);
    });

    it('rejects payload with a duplicate requirement id', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([{ id: 'r-1' }, { id: 'r-2' }]);

        await expect(reorderFrameworkRequirements(adminCtx, 'iso', [
            { section: 'A', requirementIds: ['r-1', 'r-1'] },
        ] as any)).rejects.toThrow(/Duplicate requirement id/i);
    });

    it('rejects partial overlay (count must equal live requirements)', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1' }, { id: 'r-2' }, { id: 'r-3' },
        ]);

        await expect(reorderFrameworkRequirements(adminCtx, 'iso', [
            { section: 'A', requirementIds: ['r-1', 'r-2'] },
        ] as any)).rejects.toThrow(/2 of 3 requirements — partial reorders are not supported/);
    });

    it('upserts every overlay entry and emits FRAMEWORK_REORDERED audit on success', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1', key: 'iso', version: '2022' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([
            { id: 'r-1' }, { id: 'r-2' },
        ]);
        (mockTenantDb.frameworkRequirementOrder.upsert as jest.Mock).mockImplementation(async (args: any) => ({
            id: `o-${args.create.requirementId}`,
        }));

        const res = await reorderFrameworkRequirements(adminCtx, 'iso', [
            { section: 'A', requirementIds: ['r-2', 'r-1'] },
        ] as any);

        expect(res).toEqual({ updated: 2 });
        expect(mockTenantDb.frameworkRequirementOrder.upsert).toHaveBeenCalledTimes(2);

        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.action).toBe('FRAMEWORK_REORDERED');
        expect(payload.detailsJson.requirementCount).toBe(2);
        expect(payload.detailsJson.sectionCount).toBe(1);
    });
});

// keep readerCtx reference live; admin only path is the write side
void readerCtx;
// keep buildFrameworkTree mock import live so a future test can assert
// the framework-projection shape if needed
void buildFrameworkTree;
