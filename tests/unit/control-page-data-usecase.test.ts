/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/control/page-data.ts`.
 *
 * Roadmap Q1 — Compliance core. Single-function orchestrator that
 * collapses the previous client-side `GET /controls/:id` →
 * `GET /controls/:id/sync` waterfall into a server-side dispatch.
 *
 * Covers:
 *   - No automationKey → syncStatus: null (skip lazy import + DB
 *     lookup entirely).
 *   - With automationKey → derive provider from key prefix, do
 *     PrismaSyncMappingStore lookup, return populated SyncStatus.
 *   - Sync-lookup error → graceful degrade to syncStatus: null
 *     (page still loads with control payload; logger.warn fires).
 *   - notFound on missing control propagates from getControlHeader.
 */

const mockStore = {
    findByLocalEntity: jest.fn(),
};

jest.mock('@/app-layer/integrations/prisma-sync-store', () => ({
    PrismaSyncMappingStore: jest.fn().mockImplementation(() => mockStore),
}));

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: any) => fn()),
}));

jest.mock('@/lib/observability/logger', () => ({
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/app-layer/usecases/control/queries', () => ({
    getControlHeader: jest.fn(),
}));

import { getControlHeader } from '@/app-layer/usecases/control/queries';
import { logger } from '@/lib/observability/logger';
import { getControlPageData } from '@/app-layer/usecases/control/page-data';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const readerCtx = makeRequestContext('READER');

// ─── No automationKey — skip sync ──────────────────────────────────

describe('getControlPageData — no automationKey', () => {
    it('returns syncStatus: null when the control has no automationKey', async () => {
        (getControlHeader as jest.Mock).mockResolvedValue({ id: 'c-1', name: 'X', automationKey: null });

        const res = await getControlPageData(readerCtx, 'c-1');

        expect(res.control).toEqual({ id: 'c-1', name: 'X', automationKey: null });
        expect(res.syncStatus).toBeNull();
        expect(mockStore.findByLocalEntity).not.toHaveBeenCalled();
    });

    it('returns syncStatus: null when automationKey is undefined (missing column)', async () => {
        (getControlHeader as jest.Mock).mockResolvedValue({ id: 'c-1', name: 'X' });

        const res = await getControlPageData(readerCtx, 'c-1');

        expect(res.syncStatus).toBeNull();
    });
});

// ─── With automationKey — sync lookup ──────────────────────────────

describe('getControlPageData — with automationKey', () => {
    it('derives provider from the key prefix and returns populated SyncStatus', async () => {
        (getControlHeader as jest.Mock).mockResolvedValue({
            id: 'c-1', name: 'X', automationKey: 'aws.s3.bucket-policy-check',
        });
        const now = new Date('2026-06-01T12:00:00Z');
        mockStore.findByLocalEntity.mockResolvedValue({
            syncStatus: 'IN_SYNC',
            lastSyncedAt: now,
            lastSyncDirection: 'PUSH',
            errorMessage: null,
        });

        const res = await getControlPageData(readerCtx, 'c-1');

        expect(res.syncStatus).toEqual({
            syncStatus: 'IN_SYNC',
            lastSyncedAt: now,
            lastSyncDirection: 'PUSH',
            errorMessage: null,
            provider: 'aws',
        });
        const call = mockStore.findByLocalEntity.mock.calls[0];
        expect(call[1]).toBe('aws');
        expect(call[2]).toBe('control');
        expect(call[3]).toBe('c-1');
    });

    it('returns nulls on every SyncStatus field when no mapping row exists', async () => {
        (getControlHeader as jest.Mock).mockResolvedValue({
            id: 'c-1', name: 'X', automationKey: 'azure.foo.bar',
        });
        mockStore.findByLocalEntity.mockResolvedValue(null);

        const res = await getControlPageData(readerCtx, 'c-1');

        expect(res.syncStatus).toEqual({
            syncStatus: null,
            lastSyncedAt: null,
            lastSyncDirection: null,
            errorMessage: null,
            provider: 'azure',
        });
    });

    it('graceful degrades to syncStatus: null when the lookup throws (logs warn)', async () => {
        (getControlHeader as jest.Mock).mockResolvedValue({
            id: 'c-1', name: 'X', automationKey: 'aws.something',
        });
        mockStore.findByLocalEntity.mockRejectedValue(new Error('Sync store down'));

        const res = await getControlPageData(readerCtx, 'c-1');

        expect(res.control).toMatchObject({ id: 'c-1' });
        expect(res.syncStatus).toBeNull();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        const warnArgs = (logger.warn as jest.Mock).mock.calls[0];
        expect(warnArgs[0]).toMatch(/sync lookup failed/i);
        expect(warnArgs[1]).toMatchObject({ component: 'control-page-data', controlId: 'c-1' });
    });
});

// ─── notFound propagation ──────────────────────────────────────────

describe('getControlPageData — notFound propagation', () => {
    it('lets a notFound from getControlHeader bubble up unchanged', async () => {
        (getControlHeader as jest.Mock).mockRejectedValue(new Error('Control not found'));

        await expect(getControlPageData(readerCtx, 'missing')).rejects.toThrow(/Control not found/i);
        expect(mockStore.findByLocalEntity).not.toHaveBeenCalled();
    });
});
