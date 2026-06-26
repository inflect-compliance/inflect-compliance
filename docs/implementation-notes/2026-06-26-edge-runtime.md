# 2026-06-26 — Edge-runtime audit + csp-report to edge

**Commit:** `<pending>` perf(edge): edge runtime for the csp-report forwarder + edge-eligibility audit

## Edge-eligibility audit

Walked every probe / beacon / public route's import graph. The prompt's
candidate list was largely stale — the honest result:

| Route | Verdict | Why |
|-------|---------|-----|
| `/api/csp-report` | **edge** ✅ | Pure forwarder — only `NextResponse` + `fetch` + `URL`. No DB, no Node modules. Browser-sent from anywhere → edge helps. |
| `/api/health` | node | Imports `PrismaClient` + `PrismaPg` — it's a DEEP health check (hits the DB), not a canned response. |
| `/api/readyz` | node | Prisma + `@aws-sdk/client-s3` + pino logger. |
| `/api/livez` | node | Uses `process.uptime()` (Node-only; would 500 on edge → liveness restart loop). Intra-cluster probe anyway — no edge benefit. |
| `/api/telemetry/vitals` | node | `web-vitals.ts` imports the pino logger (`./logger`) — pino is Node-only. (This is the real RUM beacon; the prompt's `/api/rum` was removed in the RUM scope-correction.) |
| `/no-tenant` | node | Imports `@/auth` → the NextAuth stack → Prisma. |
| `/login`, `/forgot-password`, `/reset-password` | node (for now) | Client-component pages. `export const runtime` is unsupported in a `'use client'` module (Next build error). Going edge needs a server-wrapper refactor — see "Deferred". |
| `/register` | n/a | Does not exist. |

## What shipped

- **`/api/csp-report` → `runtime = 'edge'`.** The one verified-clean
  migration. A legacy, stateless CSP-report forwarder; browsers POST to
  it from anywhere, so terminating at the nearest PoP saves the
  cold-start + cross-region hop.
- **`tests/guardrails/edge-runtime-coverage.test.ts`** — the durable
  guard. Beyond pinning csp-report=edge and the 4 known-Node routes
  (PDF/processes/reports exports + the SSE stream) = nodejs, its
  load-bearing invariant is: **no route declaring `runtime = 'edge'` may
  import a Node-only dep** (`@/lib/prisma`, `@/lib/db-context`, the pino
  logger, `@aws-sdk/*`, `node:*`, `@prisma/*`). A future edge route that
  pulls one in fails here before it fails the Next build.

## Deferred (honest)

- **Auth pages to edge** (the biggest user-facing win). They're
  client-component pages; Next errors on a segment-config `runtime` export
  from a `'use client'` module. The correct path is a server-wrapper
  refactor per page: rename the current page to `*Form.tsx` (`'use
  client'`), make `page.tsx` a Server Component that declares
  `runtime = 'edge'` and renders `<LoginForm/>`. The wrapper imports only
  the client form (edge-safe). Left as a follow-up — it's a real refactor
  whose win can't be validated in this environment.
- **Rate-limit presets for beacons.** `/api/telemetry/vitals` already has
  a dedicated limiter (`acceptVitalBeacon`); `/api/csp-report` is a cheap
  stateless forward. Re-wiring the edge read-limiter (which carries its
  own structural ratchet on the exclusion list) for marginal benefit
  wasn't worth the risk — skipped.
- **Measurement.** No baseline RUM exists yet, and remote-region
  cold-start curls can't run here. Post-deploy checklist: `time curl -I
  https://<host>/api/csp-report` from a remote region; TTFB for the auth
  pages once they're edge-wrapped. No fabricated numbers.

## Files

| File | Role |
|------|------|
| `src/app/api/csp-report/route.ts` | `export const runtime = 'edge'` + rationale |
| `tests/guardrails/edge-runtime-coverage.test.ts` | edge=edge / node=node + the no-Node-import-on-edge invariant |
