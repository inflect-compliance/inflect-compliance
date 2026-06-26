/**
 * Tests for the Redis-backed aggregation cache.
 *
 * Mocks ioredis with ioredis-mock so the real command logic (GET / SET /
 * EX / MGET / INCR) runs in-process. Coverage:
 *   • miss runs compute once, then subsequent reads hit;
 *   • a bump to ANY dependsOn entity invalidates → next read misses;
 *   • a bump to an UNRELATED entity does NOT invalidate;
 *   • different scopeId → isolated entries;
 *   • different params → different entries;
 *   • no-Redis fallback computes every time, never caches.
 */
jest.mock('ioredis', () => require('ioredis-mock'));
process.env.REDIS_URL = 'redis://localhost:6379';

import { cachedAggregationRead } from '@/lib/cache/aggregation-cache';
import { bumpEntityCacheVersionForScope } from '@/lib/cache/list-cache';
import { getRedis, disconnectRedis } from '@/lib/redis';
import type { RequestContext } from '@/app-layer/types';

function ctxFor(scopeId: string): RequestContext {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { tenantId: scopeId, userId: 'u', role: 'EDITOR', permissions: {}, appPermissions: {} } as any;
}

beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const redis = getRedis();
    if (redis) await redis.flushall();
});

afterAll(async () => {
    await disconnectRedis();
});

const baseOpts = {
    scopeId: 't1',
    aggregation: 'controls-dashboard',
    dependsOn: ['control', 'task'] as const,
    ttlSeconds: 60,
};

it('miss computes once, then reads hit the cache', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    const a = await cachedAggregationRead({ ...baseOpts, compute });
    const b = await cachedAggregationRead({ ...baseOpts, compute });

    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 }); // served from cache, compute not re-run
    expect(calls).toBe(1);
});

it('a bump to a dependsOn entity invalidates the entry', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedAggregationRead({ ...baseOpts, compute }); // miss → 1
    await bumpEntityCacheVersionForScope('t1', 'task');    // invalidate
    const after = await cachedAggregationRead({ ...baseOpts, compute }); // miss → 2

    expect(after).toEqual({ n: 2 });
    expect(calls).toBe(2);
});

it('a bump to an UNRELATED entity does not invalidate', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedAggregationRead({ ...baseOpts, compute }); // miss → 1
    await bumpEntityCacheVersionForScope('t1', 'vendor');  // not in dependsOn
    await cachedAggregationRead({ ...baseOpts, compute }); // still a hit

    expect(calls).toBe(1);
});

it('different scopeId gets an isolated entry', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedAggregationRead({ ...baseOpts, scopeId: 't1', compute });
    await cachedAggregationRead({ ...baseOpts, scopeId: 't2', compute });

    expect(calls).toBe(2); // each scope computed independently
});

it('different params get different entries', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedAggregationRead({ ...baseOpts, variant: { period: 30 }, compute });
    await cachedAggregationRead({ ...baseOpts, variant: { period: 90 }, compute });
    await cachedAggregationRead({ ...baseOpts, variant: { period: 30 }, compute }); // hit

    expect(calls).toBe(2);
});

it('no-Redis fallback computes every time and never caches', async () => {
    delete process.env.REDIS_URL;
    await disconnectRedis();
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedAggregationRead({ ...baseOpts, compute });
    await cachedAggregationRead({ ...baseOpts, compute });

    expect(calls).toBe(2);
});
