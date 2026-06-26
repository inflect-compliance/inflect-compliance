# 2026-06-26 — CloudFront CDN in front of static assets

**Commit:** `infra(cdn): CloudFront in front of static assets`

## Design

A CloudFront distribution as a global edge tier in front of the existing
Caddy / Helm-ingress origin. It caches Next.js's immutable hashed output
(`/_next/static/*` 1y, `/_next/image*` 30d) and passes the HTML shell + `/api/*`
straight through. The origin, its TLS, and the app are unchanged. Disabled by
default; enabled per-environment via `cdn_enabled`. Full matrix in `docs/cdn.md`.

## Files

| File | Role |
|------|------|
| `infra/terraform/modules/cdn/{main,variables,outputs,versions}.tf` | **new** — distribution + ACM (us-east-1) + Route53 alias + DNS validation |
| `infra/terraform/{providers,main,variables,outputs}.tf` | us-east-1 provider alias; gated `module "cdn"` call; `cdn_*` vars + outputs |
| `next.config.js` | `assetPrefix: process.env.ASSET_PREFIX \|\| undefined` |
| `deploy/Caddyfile` | `Cache-Control` matchers (`/_next/static/*` immutable, `/_next/image*` 30d, else `no-store`) |
| `infra/helm/inflect/values.yaml` | `ASSET_PREFIX` `extraEnv` example |
| `.github/workflows/deploy.yml` | CloudFront invalidation step (gated on the distribution-id secret) |
| `tests/guardrails/cdn-config-coverage.test.ts` | **new** — structural ratchet |
| `docs/cdn.md` | **new** — cache matrix, invalidation contract, cost, exclusions |

## Decisions

- **Cache-behaviour matrix rationale.** `/_next/static/*` is content-addressed
  (hashed filenames) so it's safe to cache for a year, `immutable`. `/_next/image*`
  varies on the optimizer's query params and is cheaper to cache for 30 days than
  to re-optimize. `/api/*` and the HTML shell carry per-tenant auth context — TTL
  0, forward cookies + auth headers. These four behaviours are the whole contract.

- **`forwarded_values`, not cache policies.** Used the (legacy but valid)
  `forwarded_values` blocks per the spec. A follow-up could migrate to managed
  `cache_policy_id` / `origin_request_policy_id` (AWS's newer model) — behaviourally
  equivalent for this matrix.

- **Custom-origin shared-secret header instead of OAC.** The brief listed
  `aws_cloudfront_origin_access_control`, but OAC is **S3 / Lambda / MediaStore
  only** — it does not apply to a custom HTTP origin (our Caddy endpoint).
  Included instead an optional `X-CDN-Origin-Secret` custom header the origin can
  require, which is the correct custom-origin equivalent. Documented in `docs/cdn.md`.

- **Invalidation in `deploy.yml`, not `release.yml`.** `release.yml` is
  semantic-release only and does not deploy; the actual deploy is `deploy.yml`. The
  invalidation runs after the production smoke test, gated on
  `CLOUDFRONT_DISTRIBUTION_ID` so it no-ops on the current GCP-VM production (no CDN
  tier) and only fires once an operator wires CloudFront + AWS creds.

- **Wired into root, gated + count-zero by default.** The module is called from
  the root (so `terraform validate` exercises it and it's usable) but
  `count = var.cdn_enabled ? 1 : 0` keeps it out of existing environments' plans.
  Added a us-east-1 provider alias to the root for the ACM cert.

- **Validated locally.** `terraform fmt -check -recursive` + `terraform validate`
  (root, with the module wired) were run against a fetched terraform 1.9.8 — the
  validate caught a real bug (`dynamic` `for_each` needs a set, not a list →
  `toset(...)`) before it could reach CI. The `terraform plan` / `curl` checks in
  the brief are operator steps requiring AWS creds.

## Out of scope (stated in docs/cdn.md)

Evidence-bucket CDN delivery (tenant-private, signed-URL — a separate follow-up),
origin TLS changes, and edge code (Functions / Lambda@Edge).
