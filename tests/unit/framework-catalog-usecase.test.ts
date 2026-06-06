/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/framework/catalog.ts`.
 *
 * Roadmap Q1 — Compliance core. Tests the four global-catalog
 * read paths over `prisma.framework` etc. Mocks the prisma client
 * since this file bypasses runInTenantContext (frameworks are
 * global, not tenant-scoped).
 *
 * Covers:
 *   - listFrameworks — `_count` shape + sort order.
 *   - getFramework — version-pinned vs latest lookup, notFound.
 *   - getFrameworkRequirements — notFound on missing framework,
 *     requirements query shape.
 *   - listFrameworkPacks — same notFound pattern, packs `_count`
 *     shape.
 */

jest.mock('@/lib/prisma', () => ({
    prisma: {
        framework: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
        frameworkRequirement: { findMany: jest.fn() },
        frameworkPack: { findMany: jest.fn() },
    },
}));

import { prisma } from '@/lib/prisma';
import {
    listFrameworks,
    getFramework,
    getFrameworkRequirements,
    listFrameworkPacks,
} from '@/app-layer/usecases/framework/catalog';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const readerCtx = makeRequestContext('READER');

// ─── listFrameworks ────────────────────────────────────────────────

describe('listFrameworks', () => {
    it('queries with requirements + packs _count and key-asc order', async () => {
        (prisma.framework.findMany as jest.Mock).mockResolvedValue([{ id: 'f-1' }]);
        const rows = await listFrameworks(readerCtx);
        expect(rows).toEqual([{ id: 'f-1' }]);
        const args = (prisma.framework.findMany as jest.Mock).mock.calls[0][0];
        expect(args.include).toEqual({ _count: { select: { requirements: true, packs: true } } });
        expect(args.orderBy).toEqual({ key: 'asc' });
    });
});

// ─── getFramework ──────────────────────────────────────────────────

describe('getFramework', () => {
    it('uses version-pinned findUnique when version supplied', async () => {
        (prisma.framework.findUnique as jest.Mock).mockResolvedValue({ id: 'f-1' });
        await getFramework(readerCtx, 'iso', '2022');
        expect(prisma.framework.findUnique).toHaveBeenCalledWith({
            where: { key_version: { key: 'iso', version: '2022' } },
            include: { _count: { select: { requirements: true, packs: true } } },
        });
        expect(prisma.framework.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to findFirst by key when no version supplied', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1' });
        await getFramework(readerCtx, 'iso');
        expect(prisma.framework.findFirst).toHaveBeenCalledWith({
            where: { key: 'iso' },
            include: { _count: { select: { requirements: true, packs: true } } },
        });
    });

    it('throws notFound when missing (both lookup branches)', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(getFramework(readerCtx, 'nope')).rejects.toThrow(/Framework not found/i);
        (prisma.framework.findUnique as jest.Mock).mockResolvedValue(null);
        await expect(getFramework(readerCtx, 'iso', '9999')).rejects.toThrow(/Framework not found/i);
    });
});

// ─── getFrameworkRequirements ──────────────────────────────────────

describe('getFrameworkRequirements', () => {
    it('throws notFound when framework missing', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(getFrameworkRequirements(readerCtx, 'nope')).rejects.toThrow(/Framework not found/i);
        expect(prisma.frameworkRequirement.findMany).not.toHaveBeenCalled();
    });

    it('returns requirements scoped to the framework id, sorted asc', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([{ id: 'r-1' }]);

        const rows = await getFrameworkRequirements(readerCtx, 'iso');

        expect(rows).toEqual([{ id: 'r-1' }]);
        const args = (prisma.frameworkRequirement.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toEqual({ frameworkId: 'f-1' });
        expect(args.orderBy).toEqual({ sortOrder: 'asc' });
    });

    it('uses version-pinned framework lookup when version supplied', async () => {
        (prisma.framework.findUnique as jest.Mock).mockResolvedValue({ id: 'f-1' });
        (prisma.frameworkRequirement.findMany as jest.Mock).mockResolvedValue([]);

        await getFrameworkRequirements(readerCtx, 'iso', '2022');

        expect(prisma.framework.findUnique).toHaveBeenCalledWith({
            where: { key_version: { key: 'iso', version: '2022' } },
        });
    });
});

// ─── listFrameworkPacks ────────────────────────────────────────────

describe('listFrameworkPacks', () => {
    it('throws notFound when framework missing', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(listFrameworkPacks(readerCtx, 'nope')).rejects.toThrow(/Framework not found/i);
        expect(prisma.frameworkPack.findMany).not.toHaveBeenCalled();
    });

    it('returns packs with templateLinks _count', async () => {
        (prisma.framework.findFirst as jest.Mock).mockResolvedValue({ id: 'f-1' });
        (prisma.frameworkPack.findMany as jest.Mock).mockResolvedValue([{ id: 'p-1' }]);

        const rows = await listFrameworkPacks(readerCtx, 'iso');

        expect(rows).toEqual([{ id: 'p-1' }]);
        const args = (prisma.frameworkPack.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toEqual({ frameworkId: 'f-1' });
        expect(args.include).toEqual({ _count: { select: { templateLinks: true } } });
    });
});
