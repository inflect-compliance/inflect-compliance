/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/vendor-audit.ts`.
 *
 * Roadmap Q2 — Vendor (audit/bundle surface). Covers the highest-
 * leverage paths in this file:
 *
 *   - Evidence bundle lifecycle: list / create / addItem / removeItem
 *     / freeze / get.
 *   - Frozen-bundle guards (cannot add or remove from frozen, cannot
 *     re-freeze, cannot freeze empty).
 *   - Freeze snapshot dispatch — VENDOR_DOCUMENT vs ASSESSMENT,
 *     snapshot only written when the source entity exists.
 *   - Subprocessor listing.
 *
 * Defers register/assessment/expiry exports — those are large CSV
 * formatters worth dedicated PRs.
 */

const mockDb = {
    vendorEvidenceBundle: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    vendorEvidenceBundleItem: { create: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
    vendorDocument: { findFirst: jest.fn() },
    vendorAssessment: { findFirst: jest.fn() },
    vendorRelationship: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/events/audit', () => ({
    logEvent: jest.fn(),
}));

import { logEvent } from '@/app-layer/events/audit';
import {
    listEvidenceBundles,
    createEvidenceBundle,
    addBundleItem,
    removeBundleItem,
    freezeBundle,
    getEvidenceBundle,
    listSubprocessors,
} from '@/app-layer/usecases/vendor-audit';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const adminCtx = makeRequestContext('ADMIN', { tenantId: 'tenant-1' });
const editorCtx = makeRequestContext('EDITOR', { tenantId: 'tenant-1' });
const readerCtx = makeRequestContext('READER');

// ─── listEvidenceBundles ──────────────────────────────────────────

describe('listEvidenceBundles', () => {
    it('queries by tenant + vendor + includes createdBy + _count.items, desc order', async () => {
        (mockDb.vendorEvidenceBundle.findMany as jest.Mock).mockResolvedValue([{ id: 'b-1' }]);
        await listEvidenceBundles(readerCtx, 'v-1');
        const args = (mockDb.vendorEvidenceBundle.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toEqual({ tenantId: readerCtx.tenantId, vendorId: 'v-1' });
        expect(args.include).toEqual({
            createdBy: { select: { id: true, name: true } },
            _count: { select: { items: true } },
        });
        expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
});

// ─── createEvidenceBundle ─────────────────────────────────────────

describe('createEvidenceBundle', () => {
    it('creates the bundle + emits VENDOR_EVIDENCE_BUNDLE_CREATED audit', async () => {
        (mockDb.vendorEvidenceBundle.create as jest.Mock).mockResolvedValue({ id: 'b-1' });

        const res = await createEvidenceBundle(editorCtx, 'v-1', { name: 'Annual', description: 'd' });

        expect(res).toEqual({ id: 'b-1' });
        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.action).toBe('VENDOR_EVIDENCE_BUNDLE_CREATED');
        expect(payload.entityType).toBe('Vendor');
        expect(payload.entityId).toBe('v-1');
    });

    it('rejects READER (manage gate)', async () => {
        await expect(createEvidenceBundle(readerCtx, 'v-1', { name: 'X' })).rejects.toBeDefined();
        expect(mockDb.vendorEvidenceBundle.create).not.toHaveBeenCalled();
    });
});

// ─── addBundleItem ────────────────────────────────────────────────

describe('addBundleItem', () => {
    it('adds item when bundle exists and is not frozen', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: null });
        (mockDb.vendorEvidenceBundleItem.create as jest.Mock).mockResolvedValue({ id: 'i-1' });

        const res = await addBundleItem(editorCtx, 'b-1', { entityType: 'VENDOR_DOCUMENT', entityId: 'd-1' });

        expect(res).toEqual({ id: 'i-1' });
    });

    it('rejects when bundle is frozen', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: new Date() });
        await expect(addBundleItem(editorCtx, 'b-1', { entityType: 'X', entityId: 'x' }))
            .rejects.toThrow(/Cannot add items to a frozen bundle/);
        expect(mockDb.vendorEvidenceBundleItem.create).not.toHaveBeenCalled();
    });

    it('throws notFound when bundle is missing', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(addBundleItem(editorCtx, 'missing', { entityType: 'X', entityId: 'x' }))
            .rejects.toThrow(/Bundle not found/i);
    });
});

// ─── removeBundleItem ─────────────────────────────────────────────

describe('removeBundleItem', () => {
    it('removes when bundle is unfrozen + item exists', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: null });
        (mockDb.vendorEvidenceBundleItem.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await removeBundleItem(editorCtx, 'b-1', 'i-1');

        expect(res).toEqual({ deleted: true });
    });

    it('rejects when bundle is frozen', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: new Date() });
        await expect(removeBundleItem(editorCtx, 'b-1', 'i-1'))
            .rejects.toThrow(/Cannot remove items from a frozen bundle/);
    });

    it('throws notFound when item delete count is 0', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: null });
        (mockDb.vendorEvidenceBundleItem.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
        await expect(removeBundleItem(editorCtx, 'b-1', 'ghost')).rejects.toThrow(/Item not found/i);
    });

    it('throws notFound when bundle missing', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(removeBundleItem(editorCtx, 'missing', 'i-1')).rejects.toThrow(/Bundle not found/i);
    });
});

// ─── freezeBundle ─────────────────────────────────────────────────

describe('freezeBundle', () => {
    it('rejects when already frozen', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: new Date(), items: [{ id: 'i-1' }],
        });
        await expect(freezeBundle(editorCtx, 'b-1')).rejects.toThrow(/already frozen/);
    });

    it('rejects when empty', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: null, items: [],
        });
        await expect(freezeBundle(editorCtx, 'b-1')).rejects.toThrow(/empty bundle/i);
    });

    it('snapshots VENDOR_DOCUMENT entities into items', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: null, vendorId: 'v-1', name: 'A',
            items: [{ id: 'i-1', entityType: 'VENDOR_DOCUMENT', entityId: 'd-1' }],
        });
        const validTo = new Date();
        (mockDb.vendorDocument.findFirst as jest.Mock).mockResolvedValue({
            id: 'd-1', type: 'SOC2', title: 'Report', externalUrl: 'https://x', validTo,
        });
        (mockDb.vendorEvidenceBundle.update as jest.Mock).mockResolvedValue({ id: 'b-1', frozenAt: new Date(), items: [] });

        await freezeBundle(editorCtx, 'b-1');

        const updateArgs = (mockDb.vendorEvidenceBundleItem.update as jest.Mock).mock.calls[0][0];
        expect(updateArgs.where.id).toBe('i-1');
        expect(updateArgs.data.snapshotJson).toEqual({
            type: 'SOC2', title: 'Report', externalUrl: 'https://x', validTo,
        });
    });

    it('snapshots ASSESSMENT entities into items', async () => {
        const startedAt = new Date();
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: null, vendorId: 'v-1', name: 'A',
            items: [{ id: 'i-1', entityType: 'ASSESSMENT', entityId: 'a-1' }],
        });
        (mockDb.vendorAssessment.findFirst as jest.Mock).mockResolvedValue({
            id: 'a-1', status: 'APPROVED', score: 42, riskRating: 'LOW', startedAt,
        });
        (mockDb.vendorEvidenceBundle.update as jest.Mock).mockResolvedValue({ id: 'b-1' });

        await freezeBundle(editorCtx, 'b-1');

        const updateArgs = (mockDb.vendorEvidenceBundleItem.update as jest.Mock).mock.calls[0][0];
        expect(updateArgs.data.snapshotJson).toEqual({
            status: 'APPROVED', score: 42, riskRating: 'LOW', startedAt,
        });
    });

    it('skips snapshot when source entity does not exist', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: null, vendorId: 'v-1', name: 'A',
            items: [{ id: 'i-1', entityType: 'VENDOR_DOCUMENT', entityId: 'gone' }],
        });
        (mockDb.vendorDocument.findFirst as jest.Mock).mockResolvedValue(null);
        (mockDb.vendorEvidenceBundle.update as jest.Mock).mockResolvedValue({ id: 'b-1' });

        await freezeBundle(editorCtx, 'b-1');

        expect(mockDb.vendorEvidenceBundleItem.update).not.toHaveBeenCalled();
    });

    it('emits VENDOR_EVIDENCE_BUNDLE_FROZEN audit with itemCount in metadata', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({
            id: 'b-1', frozenAt: null, vendorId: 'v-1', name: 'A',
            items: [{ id: 'i-1', entityType: 'OTHER', entityId: 'o-1' }, { id: 'i-2', entityType: 'OTHER', entityId: 'o-2' }],
        });
        (mockDb.vendorEvidenceBundle.update as jest.Mock).mockResolvedValue({ id: 'b-1' });

        await freezeBundle(editorCtx, 'b-1');

        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.action).toBe('VENDOR_EVIDENCE_BUNDLE_FROZEN');
        expect(payload.metadata.itemCount).toBe(2);
        expect(payload.detailsJson.fromStatus).toBe('DRAFT');
        expect(payload.detailsJson.toStatus).toBe('FROZEN');
    });
});

// ─── getEvidenceBundle ────────────────────────────────────────────

describe('getEvidenceBundle', () => {
    it('throws notFound when bundle is missing', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(getEvidenceBundle(readerCtx, 'missing')).rejects.toThrow(/Bundle not found/i);
    });

    it('returns the bundle with items + createdBy + vendor includes', async () => {
        (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mockResolvedValue({ id: 'b-1' });
        const res = await getEvidenceBundle(readerCtx, 'b-1');
        expect(res).toEqual({ id: 'b-1' });
        const args = (mockDb.vendorEvidenceBundle.findFirst as jest.Mock).mock.calls[0][0];
        expect(args.include).toEqual({
            items: true,
            createdBy: { select: { id: true, name: true } },
            vendor: { select: { id: true, name: true } },
        });
    });
});

// ─── listSubprocessors ───────────────────────────────────────────

describe('listSubprocessors', () => {
    it('lists subprocessors scoped to tenant + primaryVendorId', async () => {
        (mockDb.vendorRelationship.findMany as jest.Mock).mockResolvedValue([{ id: 'rel-1' }]);
        const rows = await listSubprocessors(readerCtx, 'v-1');
        expect(rows).toEqual([{ id: 'rel-1' }]);
        const args = (mockDb.vendorRelationship.findMany as jest.Mock).mock.calls[0][0];
        expect(args.where).toEqual({ tenantId: readerCtx.tenantId, primaryVendorId: 'v-1' });
    });
});

// keep admin reference live for future expansion
void adminCtx;
