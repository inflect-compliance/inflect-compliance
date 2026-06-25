# Production Sizing Playbook

How to right-size `values-production.yaml` for a given tenant load. The
chart ships sane "medium" defaults (app HPA 2→10, worker ×2); this doc
maps **tenant count → RPS → active users → the CPU/memory/replica knobs
the chart already exposes**, so an operator onboarding 50 vs 5 000
tenants has a concrete starting point.

> **Read this first — what's measured vs. estimated.** The only
> empirical load data today is the k6 **smoke** baseline (`tests/load/`,
> run nightly by `.github/workflows/load-test.yml` at **25 VUs / 1 min**
> on a 2-vCPU CI runner; the thresholds there are *deliberately wider*
> than the SLOs — `p95<800ms` vs the SLO's `<500ms` read target). That
> validates the app stays healthy under modest concurrency; it is **not
> a capacity test** and does not establish an RPS ceiling. So: the
> **small** tier is loosely anchored to that smoke run; **medium /
> large / enterprise are extrapolated and untested.** Treat every number
> below as a starting point and re-baseline against real production
> telemetry. See [§What this doc is NOT](#what-this-doc-is-not).

## Tenant-count rule of thumb

Roughly **150–250 *active* tenants per app pod** as a planning starting
point, where **active = made ≥1 API request in the last 10 minutes**
(not total signed-up tenants — a 5 000-tenant install with 300 active at
peak sizes to the 300, not the 5 000). This number is **operator-empirical
and not yet measured in production** — it's seeded from the per-pod
resource envelope (1 vCPU request, 2 vCPU limit) and the smoke baseline,
nothing more. **Upgrade trigger:** when the HPA sits at `maxReplicas` or
`job:api_request_duration:p95_5m` approaches the SLO ceiling, raise
replicas first, then re-derive this ratio from the observed
requests-per-pod — don't trust the seed number once you have real data.

## Sizing tiers

Concrete `values-production.yaml` deltas by tier. The chart's shipped
defaults **are** the *medium* tier; the others are operator overrides
(snippets in the [appendix](#appendix-values-snippets), **not** shipped
values files — see [out of scope](#what-this-doc-is-not)).

| Tier | Tenants | Active users | Peak RPS | App replicas (HPA) | Worker | Postgres | Redis | Provenance |
|------|---------|--------------|----------|--------------------|--------|----------|-------|------------|
| **small** | ≤50 | ≤100 | ≤20 | 2 → 4 | 1 | db.t3.medium | t4g.small | observed¹ |
| **medium** | ≤500 | ≤1 000 | ≤200 | 2 → 10 *(default)* | 2 | db.r5.large | r6g.medium | extrapolated² |
| **large** | ≤2 000 | ≤5 000 | ≤1 000 | 4 → 20 | 4 | db.r5.2xlarge | r6g.large | extrapolated² |
| **enterprise** | ≤10 000 | ≤20 000 | ≤4 000 | 8 → 40 | 8 | Aurora (writer + reader) | ElastiCache cluster | extrapolated² |

¹ **observed** — the app runs healthy under the nightly k6 smoke
(25–50 VU, 2-vCPU CI) with `http_req_failed` rate < 0.01; that concurrency
sits in the small tier's band. Still a smoke run, not a capacity proof.
² **extrapolated, untested** — scaled roughly linearly from the small
envelope + the chart's CPU-bound HPA. **No load test validates these.**
Run a real steady-state capacity test (k6 at the tier's VU target with
warmup) before committing to medium+ in production.

<!-- sizing-provenance
small: observed — k6 smoke baseline (25–50 VU, 2-vCPU CI) via load-test.yml; concurrency in-band, http_req_failed<0.01
medium: extrapolated — untested; chart default HPA 2→10; validate with a steady-state capacity run
large: extrapolated — untested; linear scale-up from small envelope
enterprise: extrapolated — untested; assumes Aurora read-replica offload + Redis cluster
-->

## Per-component sizing model

### app (Next.js web)
Serves all HTTP/API traffic. Chart default: request **1 vCPU / 512Mi**,
limit **2 vCPU / 1Gi**, HPA `minReplicas: 2 / maxReplicas: 10` on
**70% CPU**.
- **Idle vs peak:** CPU-bound under request load (the HPA scales on CPU,
  not memory); memory is comparatively flat. Watch
  `sum by (http_route,http_method)(rate(api_request_count_total[5m]))`
  (RPS) and `job:api_request_duration:p95_5m` on the API dashboard
  (`infra/observability/grafana/dashboards/*.json`).
- **Knob:** raise `autoscaling.maxReplicas` (and `minReplicas` for a
  higher floor) first — the app is stateless and scales horizontally.
  Bump per-pod CPU limit only if a single request is CPU-heavy.
- **Outgrown when:** HPA pinned at `maxReplicas` during peak, **or**
  `job:api_request_duration:p95_5m` approaches the SLO ceiling
  (reads 500ms / writes 1000ms — `docs/slos.md` SLO 2/2b).

### worker (BullMQ)
Runs background jobs (audit-stream delivery, key rotation, scheduled
sweeps). Chart default: request **500m / 256Mi**, limit **1 vCPU / 512Mi**,
prod `replicaCount: 2` (manual — no HPA on the worker).
- **Idle vs peak:** bursty with job fan-out. Watch
  `job_queue_depth{queue_state="waiting"}` and
  `rate(job_execution_count_total{job_status="failure"}[5m])`.
- **Knob:** raise `worker.replicaCount` (BullMQ distributes across
  workers); bump CPU limit only for CPU-heavy jobs.
- **Outgrown when:** `job_queue_depth{queue_state="waiting"}` stays
  high — the `JobQueueDepthHigh` alert fires at **>500 waiting for 15m**
  (`docs/observability/03-prometheus-grafana.md`).

### pgbouncer (sidecar)
Connection pooler in the app pod (transaction mode). Chart default:
request **50m / 64Mi**, limit **250m / 128Mi**,
`PGBOUNCER_DEFAULT_POOL_SIZE: 25`.
- **Knob:** raise `pgbouncer.extraEnv.PGBOUNCER_DEFAULT_POOL_SIZE` as app
  replicas grow — but the **product of (replicas × pool_size) must stay
  under Postgres `max_connections`**. That ceiling is usually the real
  scaling wall, which is why pooling exists.
- **Outgrown when:** PgBouncer reports `cl_waiting > 0` (clients queued
  for a server connection) — raise `pool_size` if Postgres has headroom,
  else scale Postgres.

### postgres (RDS / Aurora — external)
Primary datastore; not in the chart (managed). Sized by instance class
in the tier table.
- **Knob:** vertical (bigger instance) until write throughput saturates,
  then **Aurora with a read replica** to offload reads (the repo already
  threads a `DIRECT_DATABASE_URL` vs PgBouncer URL split).
- **Outgrown when:** RDS **CPUUtilization > 70% sustained** (CloudWatch —
  RDS metrics are not in the Prometheus stack), connection saturation, or
  replication lag on the reader.

### redis (ElastiCache — external)
Cache + BullMQ backing store + rate-limit store. Sized by node in the
tier table; **must run with `noeviction`** (see the observability
hardening runbook — evicting BullMQ keys loses jobs).
- **Outgrown when:** **`evicted_keys > 0`** (any eviction is a problem
  under `noeviction` — it means memory pressure), or CPU saturation on a
  single-node setup → move to a cluster.

## When to upgrade tiers

Six trigger signals, each with the knob to turn **first**:

1. **HPA pinned at `maxReplicas`** during peak → raise
   `autoscaling.maxReplicas` (and the node pool to host them).
2. **`job:api_request_duration:p95_5m` at the SLO ceiling** (read 500ms /
   write 1000ms) → raise app `maxReplicas`; if CPU isn't the bottleneck,
   profile the slow route / check Postgres.
3. **`job_queue_depth{queue_state="waiting"} > 500`** (alert fires at 15m)
   → raise `worker.replicaCount`.
4. **RDS `CPUUtilization > 70%` sustained** → bigger instance class; at the
   ceiling, Aurora + read replica.
5. **Redis `evicted_keys > 0`** → bigger node; confirm `noeviction`; then
   cluster mode.
6. **PgBouncer `cl_waiting > 0`** → raise `PGBOUNCER_DEFAULT_POOL_SIZE`
   (within Postgres `max_connections`), else scale Postgres.

## What this doc is NOT

A capacity planner. Tenant traffic shapes vary widely — a read-heavy
compliance-audit tenant and a write-heavy automation-rule-authoring
tenant load the system completely differently at the same "tenant
count." These tiers are **starting points**: provision near them, then
measure real production telemetry (`docs/slos.md` + the
`docs/observability/` runbooks) and adjust. The medium/large/enterprise
rows are **extrapolated and untested** — validate with a steady-state
capacity test before trusting them. **Re-baseline quarterly**; don't
carve these numbers in stone.

## Appendix: values snippets

Reference deltas to layer onto `values-production.yaml` — copy the block
for your tier. (These are **not** shipped values files; the chart ships
only the medium-tier defaults.)

**small** — `autoscaling: { minReplicas: 2, maxReplicas: 4 }`,
`worker: { replicaCount: 1 }`.

```yaml
autoscaling:
  minReplicas: 2
  maxReplicas: 4
worker:
  replicaCount: 1
```

**medium** — the chart defaults; no override needed
(`autoscaling: 2→10`, `worker.replicaCount: 2`).

**large** — `autoscaling: { minReplicas: 4, maxReplicas: 20 }`,
`worker: { replicaCount: 4 }`, and raise the PgBouncer pool within
Postgres `max_connections`.

```yaml
autoscaling:
  minReplicas: 4
  maxReplicas: 20
worker:
  replicaCount: 4
pgbouncer:
  extraEnv:
    PGBOUNCER_DEFAULT_POOL_SIZE: "40"
```

**enterprise** — `autoscaling: { minReplicas: 8, maxReplicas: 40 }`,
`worker: { replicaCount: 8 }`, Aurora (writer + reader) + Redis cluster.

```yaml
autoscaling:
  minReplicas: 8
  maxReplicas: 40
worker:
  replicaCount: 8
pgbouncer:
  extraEnv:
    PGBOUNCER_DEFAULT_POOL_SIZE: "50"
```

> The `maxUnavailable: 1` PodDisruptionBudget (see `docs/deployment.md`)
> holds across all tiers — every tier has `minReplicas ≥ 2`, so the PDB
> never blocks a drain.

## Observability stack sizing

The observability backend's resource caps are pinned identically across
deploy paths: collector 512m/1cpu, Prometheus 1g/1cpu, Tempo 1g/1cpu,
Grafana 512m/0.75cpu (compose `mem_limit`/`cpus` ==
`infra/helm/observability/values-production.yaml` limits). Managed
Grafana Cloud (`infra/terraform/modules/observability`) offloads this
sizing to the vendor. See
[`docs/observability/01-deployment-topology.md`](observability/01-deployment-topology.md#scale-out-provisioning-beyond-the-single-vm).
