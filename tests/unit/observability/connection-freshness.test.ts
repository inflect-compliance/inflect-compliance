/**
 * GAP-3 — per-connection DB-backed freshness.
 *
 * Proves the cross-tenant freshness computation: seconds since the last
 * PASSED execution per enabled connection, the never-succeeded fallback to
 * connection age, and the stalest-first cap. The gauge itself is registered
 * idempotently.
 */
const prismaMock = {
    integrationConnection: { findMany: jest.fn() },
    integrationExecution: { groupBy: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
    getEnabledConnectionFreshness,
    startConnectionFreshnessReporting,
    _resetConnectionFreshnessForTesting,
    CONNECTION_STALE_AFTER_SECONDS,
    MAX_FRESHNESS_SERIES,
} from '@/lib/observability/connection-freshness';

const NOW = 1_700_000_000_000; // fixed epoch-ms
const minsAgo = (m: number) => new Date(NOW - m * 60_000);

beforeEach(() => {
    jest.clearAllMocks();
    _resetConnectionFreshnessForTesting();
});

describe('getEnabledConnectionFreshness', () => {
    it('returns empty when there are no enabled connections', async () => {
        prismaMock.integrationConnection.findMany.mockResolvedValue([]);
        const rows = await getEnabledConnectionFreshness(NOW);
        expect(rows).toEqual([]);
        expect(prismaMock.integrationExecution.groupBy).not.toHaveBeenCalled();
    });

    it('computes seconds since the last PASSED execution per connection', async () => {
        prismaMock.integrationConnection.findMany.mockResolvedValue([
            { id: 'c1', provider: 'okta', tenantId: 't1', createdAt: minsAgo(10_000) },
            { id: 'c2', provider: 'aws', tenantId: 't1', createdAt: minsAgo(10_000) },
        ]);
        prismaMock.integrationExecution.groupBy.mockResolvedValue([
            { connectionId: 'c1', _max: { completedAt: minsAgo(30), executedAt: minsAgo(31) } },
            { connectionId: 'c2', _max: { completedAt: null, executedAt: minsAgo(90) } },
        ]);
        const rows = await getEnabledConnectionFreshness(NOW);
        const byId = Object.fromEntries(rows.map((r) => [r.connectionId, r]));
        expect(byId.c1.secondsSinceLastSuccess).toBe(30 * 60);
        expect(byId.c1.hasEverSucceeded).toBe(true);
        // falls back to executedAt when completedAt is null
        expect(byId.c2.secondsSinceLastSuccess).toBe(90 * 60);
    });

    it('a never-succeeded connection ages from its createdAt (not infinite)', async () => {
        prismaMock.integrationConnection.findMany.mockResolvedValue([
            { id: 'c1', provider: 'okta', tenantId: 't1', createdAt: minsAgo(45) },
        ]);
        prismaMock.integrationExecution.groupBy.mockResolvedValue([]); // no successes
        const [row] = await getEnabledConnectionFreshness(NOW);
        expect(row.hasEverSucceeded).toBe(false);
        expect(row.lastSuccessAtMs).toBeNull();
        expect(row.secondsSinceLastSuccess).toBe(45 * 60);
    });

    it('caps the series at MAX_FRESHNESS_SERIES, stalest-first', async () => {
        const conns = Array.from({ length: MAX_FRESHNESS_SERIES + 5 }, (_, i) => ({
            id: `c${i}`, provider: 'p', tenantId: 't1', createdAt: minsAgo(i + 1),
        }));
        prismaMock.integrationConnection.findMany.mockResolvedValue(conns);
        prismaMock.integrationExecution.groupBy.mockResolvedValue([]);
        const rows = await getEnabledConnectionFreshness(NOW);
        expect(rows).toHaveLength(MAX_FRESHNESS_SERIES);
        // stalest (largest age → largest createdAt offset) first
        expect(rows[0].secondsSinceLastSuccess).toBeGreaterThanOrEqual(rows[1].secondsSinceLastSuccess);
    });
});

describe('startConnectionFreshnessReporting', () => {
    it('is idempotent (safe to call twice)', () => {
        expect(() => {
            startConnectionFreshnessReporting();
            startConnectionFreshnessReporting();
        }).not.toThrow();
    });

    it('exports a sane stale threshold (2 days)', () => {
        expect(CONNECTION_STALE_AFTER_SECONDS).toBe(48 * 60 * 60);
    });
});
