/**
 * List-read cache (Redis-backed).
 *
 * Wraps the hottest list usecases — controls, risks, evidence — so
 * cache hits skip the DB round-trip entirely. Mutation paths bump
 * a per-tenant version counter to invalidate every cached entry of
 * the same entity in O(1).
 *
 * Architectural choices and why:
 *
 *   • **Per-(tenant, entity) version counter.** Cache keys embed the
 *     current version of `entity:tenant`. A write calls
 *     `bumpEntityCacheVersion()` which INCRs the counter; old
 *     entries become unreachable immediately and time out via
 *     TTL. Avoids a SCAN+DEL pattern (slow on big keyspaces) and
 *     avoids per-filter-shape invalidation tracking (impossible to
 *     enumerate from a write path). One Redis op per write, no
 *     coordination.
 *
 *   • **Tenant in the key, always.** Tenant isolation is enforced
 *     at the DB layer by RLS, but caching bypasses RLS by
 *     construction. The cache key includes `ctx.tenantId` so a
 *     request from tenant A can never read tenant B's cache entry.
 *     The structural test in `tests/unit/list-cache.test.ts`
 *     asserts this invariant directly.
 *
 *   • **TTL is a safety net, not the primary correctness mechanism.**
 *     Default TTL is 60s. Combined with explicit version bumps on
 *     every write, the worst-case staleness is bounded:
 *       - With invalidation working: instant fresh-read after a
 *         mutation
 *       - With invalidation broken (e.g. a write usecase forgot to
 *         call `bumpEntityCacheVersion`): bounded to TTL
 *
 *   • **Fail-open on Redis errors.** A Redis hiccup must not break
 *     the API. Get/set failures fall through to the loader.
 *     Mirrors the fail-open posture in `authRateLimit.ts` and
 *     `apiReadRateLimit.ts`.
 *
 *   • **No-Redis dev/test ergonomics.** When `getRedis()` returns
 *     null (no `REDIS_URL` configured — dev or test without the
 *     local redis container), the helper bypasses the cache
 *     entirely and calls the loader directly. The wrapped usecases
 *     behave exactly as if no cache existed.
 *
 *   • **Stable filter hashing.** The cache key includes a SHA-256
 *     hash of a key-sorted JSON view of the filter object. Same
 *     filters (regardless of property order) → same hash → same
 *     cache entry. Different filters → different hash → different
 *     entry.
 */
import { createHash } from 'node:crypto';
import type { RequestContext } from '@/app-layer/types';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';
import type { AggregationEntity } from '@/lib/cache/aggregation-registry';

const CACHE_PREFIX = 'inflect:cache:v1';
const DEFAULT_TTL_SECONDS = 60;
// 30 days — version counter shouldn't be evicted under normal load
// and an evicted counter just means the next read pays a cache miss.
const VERSION_KEY_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Entities that opt into list-result caching. Tightly enumerated
 * because each entry implies a write-side responsibility (call
 * `bumpEntityCacheVersion` on every write) — adding a new entity
 * here without wiring the writes is a correctness bug.
 */
export type CacheableEntity = 'control' | 'risk' | 'evidence' | 'task';

/**
 * Canonical per-(scope, entity) version-counter key. Shared by the list
 * cache and the aggregation cache (`aggregation-cache.ts`) so a single
 * `bumpEntityCacheVersion` invalidates BOTH a list cache and every
 * aggregation that depends on the same entity. `scopeKey` is the tenantId
 * for tenant-scoped entities and the organizationId for org-scoped ones.
 */
export function entityVersionKey(scopeKey: string, entity: AggregationEntity): string {
    return `${CACHE_PREFIX}:ver:${entity}:${scopeKey}`;
}

export interface CachedReadOptions<T> {
    ctx: RequestContext;
    /** Domain entity. Used for invalidation. */
    entity: CacheableEntity;
    /** Distinguishes multiple read shapes per entity (e.g. 'list', 'listPaginated'). */
    operation: string;
    /**
     * Filters / params that distinguish results. Hashed to form
     * part of the key — different filters get different cache
     * entries. Pass a stable, JSON-serialisable shape; functions
     * and Date instances are fine but the hash treats them by
     * `JSON.stringify` semantics so prefer plain primitives where
     * possible.
     */
    params: unknown;
    /** TTL in seconds. Default 60. */
    ttlSeconds?: number;
    /** The underlying DB query. Only called on cache miss. */
    loader: () => Promise<T>;
}

export async function cachedListRead<T>(opts: CachedReadOptions<T>): Promise<T> {
    const redis = getRedis();
    if (!redis) {
        // No Redis configured — bypass cache, call loader directly.
        // This is the dev/test ergonomics path; behaviour is
        // observationally identical to the cache-disabled state.
        return opts.loader();
    }

    const tenantId = opts.ctx.tenantId;
    const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    // Per-(entity, tenant) version counter. INCR'd by writes via
    // `bumpEntityCacheVersion`; embedded in the cache key so a
    // bump leaves all prior entries unreachable.
    const versionKey = entityVersionKey(tenantId, opts.entity);

    let version = '0';
    try {
        const stored = await redis.get(versionKey);
        if (stored !== null) version = stored;
    } catch (err) {
        // Redis hiccup. Fall through to loader; we'll re-cache on
        // the next call.
        logger.warn('list-cache version-read failed', {
            component: 'list-cache',
            entity: opts.entity,
            error: err instanceof Error ? err.message : String(err),
        });
        return opts.loader();
    }

    // Stable filter hash. Same logical params (regardless of
    // property order) produce the same hash.
    const filterHash = createHash('sha256')
        .update(stableStringify(opts.params))
        .digest('hex')
        .slice(0, 16);

    const cacheKey =
        `${CACHE_PREFIX}:${opts.entity}:${opts.operation}:${tenantId}:v${version}:${filterHash}`;

    // ── HIT path ──
    const start = Date.now();
    let raw: string | null = null;
    try {
        raw = await redis.get(cacheKey);
    } catch (err) {
        // Treat as miss; log + load.
        logger.warn('list-cache get failed', {
            component: 'list-cache',
            entity: opts.entity,
            error: err instanceof Error ? err.message : String(err),
        });
    }
    if (raw !== null) {
        try {
            const parsed = JSON.parse(raw) as T;
            logger.debug('list-cache hit', {
                component: 'list-cache',
                entity: opts.entity,
                operation: opts.operation,
                latencyMs: Date.now() - start,
                tenantId,
            });
            return parsed;
        } catch {
            // Corrupted JSON — fall through to loader. The bad
            // entry will be overwritten by the upcoming `set`.
            logger.warn('list-cache parse error — refreshing', {
                component: 'list-cache',
                entity: opts.entity,
                tenantId,
            });
        }
    }

    // ── MISS path ──
    const loadStart = Date.now();
    const result = await opts.loader();
    const loadMs = Date.now() - loadStart;

    try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
    } catch (err) {
        // Failed to cache. Not user-visible — the result is
        // already on its way back to the caller.
        logger.warn('list-cache set failed', {
            component: 'list-cache',
            entity: opts.entity,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    logger.debug('list-cache miss', {
        component: 'list-cache',
        entity: opts.entity,
        operation: opts.operation,
        loadMs,
        tenantId,
    });

    return result;
}

/**
 * Short-TTL cache for the executive dashboard aggregate (PR3).
 *
 * Differs from `cachedListRead` in two deliberate ways:
 *
 *   • **Pure TTL, no version counter.** The dashboard aggregates ~13
 *     entity types (assets, risks, controls, evidence, tasks, …); a
 *     write to ANY of them would have to bump the dashboard version,
 *     which is impractical to wire correctly from every write path.
 *     A short TTL bounds staleness instead — an executive summary
 *     that's at most `ttlSeconds` stale is an acceptable trade for
 *     skipping ~30 COUNT/GROUP BY queries (and ~6 RLS transactions)
 *     on every dashboard load.
 *
 *   • **Key includes BOTH tenantId AND userId.** The executive
 *     payload carries user-specific data (the actor's unread
 *     notification count), so a tenant-only key would leak one
 *     user's counts to another. `tests/unit/list-cache.test.ts`
 *     asserts both are present in the key.
 *
 * Same fail-open posture + no-Redis bypass as `cachedListRead`, so
 * dev/test (no `REDIS_URL`) behave exactly as if uncached.
 */
const DASHBOARD_TTL_SECONDS = 30;

export async function cachedDashboardRead<T>(opts: {
    ctx: RequestContext;
    /** Distinguishes read shapes, e.g. 'executive'. */
    operation: string;
    /** Params that distinguish results (e.g. trend window). Hashed into the key. */
    params?: unknown;
    /** TTL in seconds. Default 30. */
    ttlSeconds?: number;
    loader: () => Promise<T>;
}): Promise<T> {
    const redis = getRedis();
    if (!redis) return opts.loader();

    const tenantId = opts.ctx.tenantId;
    const userId = opts.ctx.userId ?? 'anon';
    const ttl = opts.ttlSeconds ?? DASHBOARD_TTL_SECONDS;

    const filterHash = createHash('sha256')
        .update(stableStringify(opts.params ?? null))
        .digest('hex')
        .slice(0, 16);

    // tenantId + userId both in the key — see the user-specific-data note above.
    const cacheKey =
        `${CACHE_PREFIX}:dashboard:${opts.operation}:${tenantId}:${userId}:${filterHash}`;

    try {
        const raw = await redis.get(cacheKey);
        if (raw !== null) {
            try {
                return JSON.parse(raw) as T;
            } catch {
                // Corrupted entry — fall through to loader; the `set` below
                // overwrites it.
                logger.warn('dashboard-cache parse error — refreshing', {
                    component: 'dashboard-cache',
                    operation: opts.operation,
                    tenantId,
                });
            }
        }
    } catch (err) {
        logger.warn('dashboard-cache get failed', {
            component: 'dashboard-cache',
            operation: opts.operation,
            error: err instanceof Error ? err.message : String(err),
        });
        return opts.loader();
    }

    const result = await opts.loader();
    try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
    } catch (err) {
        logger.warn('dashboard-cache set failed', {
            component: 'dashboard-cache',
            operation: opts.operation,
            error: err instanceof Error ? err.message : String(err),
        });
    }
    return result;
}

/**
 * Invalidate ALL cached list-reads for `(entity, tenant)` by
 * INCR'ing the version counter. Old entries become unreachable
 * immediately (next read computes a different cache key) and
 * time out via TTL.
 *
 * Call AFTER the DB write commits — never inside the transaction.
 * If the bump itself fails (transient Redis issue), the worst
 * case is bounded staleness equal to the cache TTL. The function
 * NEVER throws — write paths shouldn't fail because Redis is
 * sneezing.
 */
export async function bumpEntityCacheVersion(
    ctx: RequestContext,
    entity: AggregationEntity,
): Promise<void> {
    await bumpEntityCacheVersionForScope(ctx.tenantId, entity);
}

/**
 * Scope-explicit version bump. Identical to `bumpEntityCacheVersion`
 * but takes the scope id directly — for org-scoped entities (e.g.
 * `orgWidget`) where the request context carries `organizationId`
 * rather than `tenantId`. Call AFTER the write commits; never throws.
 */
export async function bumpEntityCacheVersionForScope(
    scopeKey: string,
    entity: AggregationEntity,
): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const versionKey = entityVersionKey(scopeKey, entity);
    try {
        await redis.incr(versionKey);
        // Refresh the version-key TTL so it doesn't drift to
        // expiry under heavy invalidation pressure (an evicted
        // counter is harmless — next read pays a cache miss — but
        // refreshing keeps the counter durable enough that a
        // sustained invalidation pattern doesn't degrade the
        // hit rate).
        await redis.expire(versionKey, VERSION_KEY_TTL_SECONDS);
    } catch (err) {
        logger.warn('list-cache version-bump failed', {
            component: 'list-cache',
            entity,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Stable JSON serialisation — sorts keys at every level so the
 * same logical object always produces the same string regardless
 * of property declaration order.
 *
 * Exported for tests + reuse; production callers should prefer
 * `cachedListRead`.
 */
export function stableStringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map(
        (k) => JSON.stringify(k) + ':' + stableStringify(obj[k]),
    );
    return '{' + parts.join(',') + '}';
}
