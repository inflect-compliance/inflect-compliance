# 2026-06-26 — Read-replica routing for dashboard + reporting

**Commit:** `infra(db): read-replica routing for dashboard + reporting endpoints`

## Design

A same-region RDS read replica + an opt-in app-side routing layer that sends
heavy aggregation reads (dashboards, metrics, reporting) to it, keeping the
primary for writes, read-after-write, and auth/billing. Off by default; enabling
is a terraform flag + an env var. Full contract in `docs/database-routing.md`.

## The correct app-side mechanism (NOT the brief's)

The brief specified `@prisma/extension-read-replicas` + `prisma.$replica()`. That
does not work here and was **not** used:

- This is **Prisma 7 with driver adapters** (`@prisma/adapter-pg`), not the
  Prisma-5 `datasources:{db:{url}}` the extension's URL-based replica
  construction assumes.
- Every tenant read runs inside a `runInTenantContext` **interactive
  `$transaction`** (RLS: `SET LOCAL ROLE app_user` + tenant GUC). The extension
  **never routes queries inside a transaction to a replica** — so it would route
  ~nothing of the targeted dashboard load.

Instead: a second extended client (`prismaRead`) on `DATABASE_READ_URL` carrying
the same extension chain, and a `runInTenantReadContext` helper that opens the
RLS transaction on it as `READ ONLY`. Usecases opt in by swapping
`runInTenantContext` → `runInTenantReadContext`. (Surfaced this to the user before
building; they chose the correct full implementation.)

## Files

| File | Role |
|------|------|
| `infra/terraform/modules/database/{main,variables,outputs}.tf` | gated `aws_db_instance.read_replica` + `enable_read_replica` / `read_replica_instance_class` vars + `read_replica_endpoint` output |
| `infra/terraform/{main,variables,outputs}.tf` | root passthrough (`db_enable_read_replica`, …) + `db_read_replica_endpoint` output |
| `src/env.ts` | `DATABASE_READ_URL` (optional) |
| `src/lib/prisma.ts` | `buildClient(url)` / `buildExtended(url)` parameterised; `prismaRead` second client (falls back to `prisma` when unset) |
| `src/lib/db-context.ts` | `runInTenantReadContext` (replica client + `READ ONLY` tx) |
| `src/lib/db/rls-middleware.ts` | re-export the new helper |
| 9 dashboard/aggregation usecases | swapped to `runInTenantReadContext` |
| `infra/helm/inflect/values.yaml` | gated `pgbouncerRead` pool block |
| `infra/observability/.../inflect-api-overview.json` | "RDS read-replica lag (s)" panel (5s/30s thresholds) |
| `tests/guardrails/database-routing-coverage.test.ts` | ratchet |
| `docs/database-routing.md` | routing contract |

## Decisions

- **Same extension chain on `prismaRead`.** The replica client MUST keep
  field-encryption + PII (to decrypt reads) and soft-delete (to filter
  `deletedAt`); the audit extension is inert on reads. So `prismaRead` reuses the
  full `buildExtended()` on the read URL — only the connection differs.
- **`READ ONLY` transaction = runtime enforcement.** A write accidentally routed
  to a read context throws immediately, backing up the review + ratchet layers.
- **Unset `DATABASE_READ_URL` is the rollback.** `prismaRead === prisma` in that
  case, so `runInTenantReadContext` transparently uses the primary — single lever,
  no redeploy.
- **PgBouncer can't split**, so the replica gets its own pool (`pgbouncerRead`,
  sidecar). There is no standalone pgbouncer template in this chart (it's a
  sidecar), so the brief's "sibling template" was a values block instead; wiring
  the second sidecar container into `deployment.yaml` is the documented operator
  step.
- **Validated locally** with terraform 1.9.8: `fmt -check -recursive` + root
  `validate` (replica wired, gated) both pass. The brief's `plan` / `psql
  pg_is_in_recovery()` / CloudWatch-RowsRead checks are operator steps (need a live
  replica).

## Out of scope

Aurora, cross-region replicas, materialised views — separate follow-ups.
