# Database routing — primary vs read replica

> **New to the codebase?** Start at [CONTRIBUTING.md](../CONTRIBUTING.md).

This deployment can run a same-region RDS **read replica** for analytical /
dashboard reads, taking aggregation pressure off the primary. Routing is
**opt-in per usecase** and deliberately conservative — replicas are eventually
consistent, so only reads that tolerate lag go there.

## The two clients

Both live in `src/lib/prisma.ts` and carry the **same extension chain** (audit,
soft-delete, field-encryption, PII, RLS-tripwire) — so encrypted columns decrypt
and `deletedAt` filtering applies on either path:

| Client | Connection | Used by |
|--------|-----------|---------|
| `prisma` | `DATABASE_URL` (primary, via PgBouncer) | everything by default |
| `prismaRead` | `DATABASE_READ_URL` (replica, via its own PgBouncer) | replica-tolerant reads only |

When `DATABASE_READ_URL` is **unset**, `prismaRead === prisma` — single-DB mode.
Nothing else changes; this is the safe default and the rollback (see below).

## The routing helpers

Reads run inside an RLS transaction (`SET LOCAL ROLE app_user` + tenant GUC).
Two context helpers in `src/lib/db-context.ts` (re-exported from
`@/lib/db/rls-middleware`):

- **`runInTenantContext(ctx, fn)`** — opens the transaction on the **primary**.
  The default for all reads + every write.
- **`runInTenantReadContext(ctx, fn)`** — opens the transaction on **`prismaRead`**
  and marks it `READ ONLY`. Use ONLY for replica-tolerant reads. A write inside it
  fails fast (the replica rejects it, and `READ ONLY` rejects it on the primary
  too) — so the "no writes on the read path" rule is enforced at runtime.

> Why not `@prisma/extension-read-replicas`? This codebase is Prisma 7 with driver
> adapters, and every tenant read runs inside an interactive `$transaction` (the
> RLS context). That extension never routes queries inside a transaction to a
> replica — so it would route ~nothing here. Explicit `runInTenantReadContext` is
> both functional and reviewable.

## Routing rules

| Read class | Route | Why |
|------------|-------|-----|
| Dashboards / aggregations / reporting | **replica** (`runInTenantReadContext`) | high-cost, lag-tolerant |
| List reads | replica-eligible; served from the primary today | lag-tolerant, but unrouted pending a measured win |
| Detail reads, **especially read-after-write** | **primary** (`runInTenantContext`) | a GET right after a POST must see the write |
| Auth / session / billing | **primary** | latency-sensitive + tightly coupled to writes |
| All writes | **primary** | replicas are read-only |

### Endpoints routed to the replica today

Six endpoints, via six usecase functions — each verified write-free in its
read-context callback (the ratchet `database-routing-coverage.test.ts` enforces
both presence and the no-write rule):

| Endpoint | Usecase |
|----------|---------|
| `GET .../controls/dashboard` | `getControlDashboard` |
| `GET .../vendors/metrics` | `getVendorMetrics` |
| `GET .../tasks/metrics` **and** `.../issues/metrics` | `getTaskMetrics` (shared) |
| `GET .../loss-events/aggregate` | `getLossEventAggregate` |
| `GET .../tests/dashboard` | `getTestDashboardMetrics` + `getTestDashboard` |

### Deferred (intentionally NOT routed yet — would be incorrect today)

Four of the originally-listed endpoints are **kept on the primary** because
routing them as-is would be wrong; each needs a focused follow-up, not a blunt
swap:

- **`risks/reports`** (`generateReport`) — **writes** `ReportRun` (create +
  status update) in the same flow; a `READ ONLY` context would throw. Splitting
  the read portion out is the follow-up.
- **`risks/dashboard`** (`getRiskDashboard`) — a `Promise.allSettled` fan-out over
  shared sub-usecases (incl. `getRiskMatrixConfig`, which is config/latency-
  sensitive and belongs on the primary). Route the heavy *sub-queries*, not the
  aggregator.
- **`audits/readiness/overview`** (`getReadinessOverview`) — fans out over the
  general-purpose `listAuditCycles`, reused by non-dashboard callers (some
  read-after-write). Routing it wholesale would mis-route those.
- **`org/:slug/dashboard/widgets`** (`listOrgDashboardWidgets`) — **org-scoped**
  (`getOrgCtx`), not the tenant `runInTenantContext` model; needs an org-level
  read-context helper first.

## The read-after-write rule (and how it's enforced)

A read that must observe a just-committed write **must** use the primary
(`runInTenantContext`). The replica lags ~10–50 ms cross-AZ; a
risk-detail-after-create on the replica could 404 or show stale data.

Enforcement is three-layered:
1. **Review** — `runInTenantReadContext` is a visible, greppable marker at the
   usecase boundary.
2. **Ratchet** — CI fails if `runInTenantReadContext` co-occurs with a write
   (`.create(` / `.update(` / `.delete(` / `.upsert(`) in the same file.
3. **Runtime** — the read context's transaction is `READ ONLY`; a stray write
   throws immediately.

## Replication-lag contract

- **Eventually consistent.** Soft target: **< 5 s** lag. **Alert threshold:
  > 30 s** (the "RDS read-replica lag (s)" panel on the API Overview dashboard).
- At sustained high lag, **back off**: unset `DATABASE_READ_URL` (rollback below)
  so all traffic returns to the primary until the replica catches up.

## Rollback / opt-out

Set **`DATABASE_READ_URL=""`** (or unset it) and restart the app. `prismaRead`
falls back to `prisma`, and `runInTenantReadContext` transparently uses the
primary. No code change, no redeploy of the chart — the single safe lever during
a replica incident.

## Infrastructure

- **Terraform** — `infra/terraform/modules/database` provisions the replica when
  `db_enable_read_replica = true` (root var); endpoint surfaces as the
  `db_read_replica_endpoint` output. Off by default.
- **PgBouncer** — PgBouncer can't read/write-split, so the replica gets its own
  pool (`pgbouncerRead` in the Helm values, gated `enabled: false`), running as a
  second sidecar; `DATABASE_READ_URL` points the app at it. Wiring the second
  sidecar container into `deployment.yaml` is the operator step when enabling.

## Out of scope

Aurora migration, cross-region replicas (see `docs/multi-region.md`), and
materialised views for dashboards — all separate follow-ups. Reading from a
replica keeps the same queries; materialisation comes later if the dashboards
prove replica-friendly.
