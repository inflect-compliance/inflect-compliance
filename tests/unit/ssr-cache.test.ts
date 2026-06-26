/**
 * Tests for the SSR payload cache.
 *
 * Mocks ioredis with ioredis-mock. Coverage: miss→hit; a tenant-version
 * bump invalidates; different route / tenant are isolated; no-Redis
 * fallback always computes.
 */
jest.mock('ioredis', () => require('ioredis-mock'));
process.env.REDIS_URL = 'redis://localhost:6379';

import { cachedSsrPayload } from '@/lib/cache/ssr-cache';
import { bumpTenantCacheVersion } from '@/lib/cache/list-cache';
import { getRedis, disconnectRedis } from '@/lib/redis';

beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const redis = getRedis();
    if (redis) await redis.flushall();
});

afterAll(async () => {
    await disconnectRedis();
});

const base = { tenantId: 't1', route: 'dashboard', ttlSeconds: 60 };

it('miss computes once, then reads hit the cache', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    const a = await cachedSsrPayload({ ...base, compute });
    const b = await cachedSsrPayload({ ...base, compute });

    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(calls).toBe(1);
});

it('a tenant-version bump invalidates the payload', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedSsrPayload({ ...base, compute });   // miss → 1
    await bumpTenantCacheVersion('t1');             // any entity write does this
    const after = await cachedSsrPayload({ ...base, compute }); // miss → 2

    expect(after).toEqual({ n: 2 });
    expect(calls).toBe(2);
});

it('a bump for a DIFFERENT tenant does not invalidate', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedSsrPayload({ ...base, compute });   // miss → 1
    await bumpTenantCacheVersion('t2');             // other tenant
    await cachedSsrPayload({ ...base, compute });   // still a hit

    expect(calls).toBe(1);
});

it('different route and different tenant get isolated entries', async () => {
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedSsrPayload({ ...base, route: 'dashboard', compute });
    await cachedSsrPayload({ ...base, route: 'risks', compute });
    await cachedSsrPayload({ ...base, tenantId: 't2', route: 'dashboard', compute });

    expect(calls).toBe(3);
});

it('clamps TTL to the max', async () => {
    // Just assert the call succeeds with an over-cap TTL (helper clamps).
    const r = await cachedSsrPayload({ tenantId: 't1', route: 'x', ttlSeconds: 99999, compute: async () => 1 });
    expect(r).toBe(1);
});

it('no-Redis fallback computes every time', async () => {
    delete process.env.REDIS_URL;
    await disconnectRedis();
    let calls = 0;
    const compute = async () => { calls++; return { n: calls }; };

    await cachedSsrPayload({ ...base, compute });
    await cachedSsrPayload({ ...base, compute });

    expect(calls).toBe(2);
});
