# 2026-07-01 — Risk-matrix config save invalidates the /risks SSR cache

**Commit:** `<sha> fix(risk-matrix): invalidate the /risks SSR cache on config save`

## The bug (a real one, not an E2E flake)

`risk-matrix-admin.spec.ts:38` — "admin edits an axis title → it propagates to
/risks" — failed **consistently** (all retries, 4+ runs), not flakily. Two
test-only attempts (#1372 toggle-wait, #1373 reload-retry) did not fix it; the
reload-retry proved it wasn't transient (it retried fresh loads for 60s and
still failed).

Root cause: the `/risks` page SSR-caches its whole payload — **including
`matrixConfig`** — per tenant for a short TTL:

```ts
// src/app/t/[tenantSlug]/(app)/risks/page.tsx
await cachedSsrPayload({ tenantId, route: 'risks', ttlSeconds: 30, compute: fetchRiskPayload })
```

`updateRiskMatrixConfig` wrote the new config to the DB but **never invalidated
that cache**. `cachedSsrPayload` keys on a per-tenant version
(`ssr:risks:{tenant}:tv{version}`); with the version unchanged, `/risks` kept
serving the stale payload (default axis labels), so the custom title never
appeared. In production this is a ≤30 s staleness window after any matrix-config
edit; under the E2E's immediate save→navigate it was a hard, repeatable miss.

## The fix

One line at the end of `updateRiskMatrixConfig`, after the write:

```ts
await bumpEntityCacheVersion(ctx, 'risk');
```

`bumpEntityCacheVersion` bumps the **tenant-wide** cache version (it invalidates
every SSR payload cached for the tenant), so the next `/risks` render recomputes
with the fresh config. This mirrors how every Risk-mutating usecase in `risk.ts`
already invalidates. (`getRiskMatrixConfig` reads the DB directly — no secondary
cache to bust.)

## Why the test fixes weren't enough

The two prior PRs treated it as a locator/timing flake. It was a cache-coherence
bug: no client retry can fix a server serving a stale cached payload keyed on an
un-bumped version. The reload-retry (#1373) is left in place as harmless
defence-in-depth, but this is the actual fix.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/risk-matrix-config.ts` | `updateRiskMatrixConfig` bumps the tenant SSR cache version after the write. |
| `tests/guards/risk-matrix-config-ssr-invalidation.test.ts` | Ratchet: the invalidation is wired (after the write) + documents the `/risks` SSR cache. |
