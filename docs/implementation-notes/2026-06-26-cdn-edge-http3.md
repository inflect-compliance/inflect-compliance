# 2026-06-26 — CDN edge: HTTP/3 + brotli + keep-alive

**Commit:** `<pending>` perf(network): HTTP/3 + brotli + edge keep-alive on CloudFront

## Design

Extends the existing CloudFront module (`infra/terraform/modules/cdn/`)
to cut network latency for the **uncached** tenant HTML, not just the
cached static assets. Three levers:

- `http_version = "http2and3"` — HTTP/3 (QUIC) + implicit 0-RTT for
  supported clients.
- Origin keep-alive (`origin_keepalive_timeout = 60`) + TLS 1.3 to the
  origin — the edge holds a warm edge→origin pool so the viewer's TLS
  terminates at the nearest PoP and reuses an established origin
  connection.
- Brotli — already on via `compress = true` (CloudFront serves
  `content-encoding: br` when advertised); documented, not newly wired.

Caddy origin also advertises h3 (`protocols h1 h2 h3`) for no-CDN
deploys.

## Decisions

- **Tenant HTML stays uncached.** The default behavior is TTL 0 — a
  shared edge cache of `/t/*` would leak one tenant's page to another.
  The value of routing `/t/*` through the edge is TLS termination +
  HTTP/3 + origin keep-alive, all of which help without caching. The
  rationale lives as a comment block on the default behavior + a
  "Per-tenant edge cache (out of scope)" section in docs/cdn.md.

- **Early Hints (HTTP 103) NOT added.** The task proposed
  `experimental.earlyHints` in next.config.js, but (a) Next 16.2.9 has no
  such flag — it was removed after Next 13.4 (grep of `node_modules/next`
  finds nothing), and (b) CloudFront does not forward 103 Early Hints to
  viewers. Adding a non-functional config flag would be theater. Left out
  with this reason recorded; revisit if the stack gains real 103 support.

- **Measurement deferred (honest).** The PR ships the edge settings but
  cannot include real before/after RUM numbers: the baseline
  (`docs/perf/baseline-<date>.md`) needs ~1 week of production RUM, and
  the "after" needs ~1 week post-deploy. The PR carries literature
  estimates clearly labeled as estimates + a checklist item to fill the
  measured deltas. No fabricated win. (Operator decision: ship now,
  measure later.)

## Files

| File | Role |
|------|------|
| `infra/terraform/modules/cdn/main.tf` | `http2and3`, origin keep-alive 60s + TLS 1.3 + connect timeouts, HTML no-store rationale comment |
| `deploy/Caddyfile` | `servers { protocols h1 h2 h3 }` (origin h3 advertise) |
| `docs/cdn.md` | "Edge performance" + "Per-tenant edge cache (out of scope)" + deferred-measurement note |
| `tests/guardrails/cdn-config-coverage.test.ts` | asserts http2and3, keepalive ≥30, TLS 1.3, brotli on all behaviors, Caddy h3, HTML no-store comment |

## Verification

- `npx jest tests/guardrails/cdn-config-coverage.test.ts` — pass.
- `terraform fmt -check` + `terraform validate` — clean/Success.
- Post-deploy: `curl --http3 -I https://<cdn>/t/<slug>/dashboard` → HTTP/3;
  `content-encoding: br` with `accept-encoding: br`; RUM `web.vitals.lcp_ms`
  p95 drop in Grafana over the days after deploy.
