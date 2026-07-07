# 2026-07-07 — H1: provider-fleet ignition + public-route reachability + rate-limits

**Commit:** `<pending>` fix(h1): device-report + trust public routes reachable, rate-limited; bootstrap-wiring ratchet

## Design

Post-merge adversarial scan found three shipped features that don't run in
production. H1 makes them actually run.

### 1. Provider fleet ignition (already landed)
`integrations/bootstrap.ts` registers all 10 providers as top-level side
effects but was never imported at runtime. Fixed in the prior PR (#1525):
`instrumentation.ts::register()` (web) + `scripts/worker.ts` bootstrap
(worker) both `await import('@/app-layer/integrations/bootstrap')`. H1 adds the
**ratchet** locking that wiring in.

### 2. Reachability — the middleware blanket 401
`middleware.ts` returned `unauthorizedJson()` for any `/api/*` when
`getToken()` is null. A device agent (Bearer device token, no cookie) and an
anonymous Trust Center visitor both have null tokens, so
`POST /api/t/:slug/devices/report`, `POST /api/trust/:slug/access-request`, and
`GET /api/trust/download/:token` were 401'd **before** their in-handler auth
ran. The prefix allowlist can't express these (dynamic segment mid-path) without
exposing the whole tenant API.

Fix — a **regex public-path matcher** (`PUBLIC_API_REGEXES` in
`src/lib/auth/guard.ts`), folded into `isPublicPath`:
- `^/api/t/[^/]+/devices/report$`
- `^/api/trust/(?:[^/]+/access-request|download/[^/]+)$`

The real auth stays in-handler (`authorizeDeviceReport`; trust slug/token
checks) — the matcher only stops the blanket 401.

### 3. Edge rate-limits for the new public surfaces
Both surfaces are anonymous → scraping / probing / token-guessing targets.
`middleware.ts` now rate-limits them at the edge BEFORE allowing, mirroring the
existing `/trust/` block (`checkApiReadRateLimit`):
- `/api/trust/*` — per-IP + per-slug (`apitrust:<slug>` / `apitrust:download`)
- `/api/t/:slug/devices/report` — per-IP + per-token (`devreport:<token-prefix>`)

## Files

| File | Role |
| --- | --- |
| `src/lib/auth/guard.ts` | `PUBLIC_API_REGEXES` + fold into `isPublicPath` |
| `src/middleware.ts` | rate-limit-then-allow blocks for `/api/trust/*` + device-report |
| `tests/guards/integration-bootstrap-runtime-wiring.test.ts` | both entry points import bootstrap; importing it registers all 10 ids |
| `tests/unit/auth/public-path-matcher.test.ts` | each new path matches; near-misses don't |
| `tests/integration/middleware-public-reachability.test.ts` | routes reach handler (not 401) with no cookie; still 401 for normal tenant routes; both rate-limited |

## Decisions

- **Keyed device-report by a 16-char token prefix**, not the full token
  (avoids putting the secret in the limiter key) and not IP-only (many devices
  behind one NAT need independent buckets).
- **`download/<token>` keyed as `apitrust:download`** (shared bucket) — there's
  no slug in that path, and the token itself is the single-use credential the
  handler already guards; the edge limit is purely anti-brute-force on the
  token space.
- **Kept the regexes in `isPublicPath`** (not only inline in middleware) so the
  matcher is unit-testable and reusable, even though the middleware handles
  these explicitly before the `isPublicPath` allow.
