/**
 * Unit tests for src/app-layer/usecases/control/page-data.ts
 *
 * The page-data orchestrator collapses the previous control + sync
 * waterfall into one server-side aggregation. The load-bearing
 * assertions:
 *
 *   1. When the control has no `automationKey`, sync lookup is
 *      skipped — the orchestrator returns `syncStatus: null` without
 *      touching the sync-mapping store.
 *   2. When the control has an `automationKey`, the sync-mapping
 *      store is consulted and its result is mapped into the
 *      `SyncStatusPayload` shape.
 *   3. A failing sync lookup degrades to `syncStatus: null` rather
 *      than failing the whole call (the conflict badge is
 *      informational; the page must still load).
 *   4. `getControlHeader` errors propagate (not-found stays
 *      not-found).
 *
 * #102 item 1: the orchestrator reads `getControlHeader` (header
 * scalars + `_count`), not the full `getControl`.
 */

jest.mock('../../../src/app-layer/usecases/control/queries', () => ({
    getControlHeader: jest.fn(),
}));

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx, fn) => fn({})),
}));

const mockFindByLocalEntity = jest.fn();
jest.mock('@/app-layer/integrations/prisma-sync-store', () => ({
    PrismaSyncMappingStore: jest.fn().mockImplementation(() => ({
        findByLocalEntity: mockFindByLocalEntity,
    })),
}));

import { getControlPageData } from '@/app-layer/usecases/control/page-data';
import { getControlHeader } from '@/app-layer/usecases/control/queries';
import { makeRequestContext } from '../../helpers/make-context';

const mockGetControlHeader = getControlHeader as jest.MockedFunction<
    typeof getControlHeader
>;

beforeEach(() => {
    jest.clearAllMocks();
});

const ctx = () => makeRequestContext('READER');

const ctrl = (overrides: Partial<{ id: string; automationKey: string | null }> = {}) =>
    ({
        id: 'ctrl-1',
        name: 'Sample',
        automationKey: null,
        ...overrides,
    }) as unknown as Awaited<ReturnType<typeof getControlHeader>>;

describe('getControlPageData — no automationKey', () => {
    it('returns syncStatus: null and skips the sync store entirely', async () => {
        mockGetControlHeader.mockResolvedValue(ctrl({ automationKey: null }));

        const out = await getControlPageData(ctx(), 'ctrl-1');

        expect(out.control).toBeDefined();
        expect(out.syncStatus).toBeNull();
        expect(mockFindByLocalEntity).not.toHaveBeenCalled();
    });

    it('treats undefined automationKey the same as null', async () => {
        mockGetControlHeader.mockResolvedValue(
            ctrl({ automationKey: undefined as unknown as string | null }),
        );
        const out = await getControlPageData(ctx(), 'ctrl-1');
        expect(out.syncStatus).toBeNull();
        expect(mockFindByLocalEntity).not.toHaveBeenCalled();
    });
});

describe('getControlPageData — with automationKey', () => {
    it('looks up the sync mapping and maps it into SyncStatusPayload', async () => {
        mockGetControlHeader.mockResolvedValue(ctrl({ automationKey: 'jira.ABC-123' }));
        mockFindByLocalEntity.mockResolvedValue({
            syncStatus: 'IN_SYNC',
            lastSyncedAt: new Date('2026-01-01T00:00:00Z'),
            lastSyncDirection: 'PULL',
            errorMessage: null,
        });

        const out = await getControlPageData(ctx(), 'ctrl-1');

        expect(mockFindByLocalEntity).toHaveBeenCalledWith(
            ctx().tenantId,
            'jira',
            'control',
            'ctrl-1',
        );
        expect(out.syncStatus).toEqual({
            syncStatus: 'IN_SYNC',
            lastSyncedAt: new Date('2026-01-01T00:00:00Z'),
            lastSyncDirection: 'PULL',
            errorMessage: null,
            provider: 'jira',
        });
    });

    it('returns null sync fields when no mapping exists', async () => {
        mockGetControlHeader.mockResolvedValue(ctrl({ automationKey: 'jira.X' }));
        mockFindByLocalEntity.mockResolvedValue(null);

        const out = await getControlPageData(ctx(), 'ctrl-1');

        expect(out.syncStatus).toEqual({
            syncStatus: null,
            lastSyncedAt: null,
            lastSyncDirection: null,
            errorMessage: null,
            provider: 'jira',
        });
    });
});

describe('getControlPageData — degradation', () => {
    it('returns syncStatus: null when the sync lookup throws (does not fail the page)', async () => {
        mockGetControlHeader.mockResolvedValue(ctrl({ automationKey: 'jira.X' }));
        mockFindByLocalEntity.mockRejectedValue(new Error('store down'));

        const out = await getControlPageData(ctx(), 'ctrl-1');

        expect(out.control).toBeDefined();
        expect(out.syncStatus).toBeNull();
    });

    it('propagates getControlHeader errors (not-found stays not-found)', async () => {
        const err = Object.assign(new Error('Control not found'), { code: 'NOT_FOUND' });
        mockGetControlHeader.mockRejectedValue(err);

        await expect(getControlPageData(ctx(), 'ctrl-missing')).rejects.toThrow(
            'Control not found',
        );
        expect(mockFindByLocalEntity).not.toHaveBeenCalled();
    });
});
