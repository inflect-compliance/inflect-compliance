# 2026-06-25 — Production sizing playbook

**Commit:** `<sha>` docs(sizing): production sizing playbook (4 tiers by tenant count)

## What

`docs/sizing.md` — maps tenant count / active users / peak RPS to the
CPU/memory/replica knobs the chart exposes, across four tiers (small /
medium / large / enterprise). Pure documentation; **no new values files**
(snippets in an appendix, not shipped variants — adding `values-small.yaml`
etc. would multiply maintenance surface).

## Empirical vs. extrapolated — the load-bearing honesty

The doc's central caveat: **the only real load data is a k6 *smoke*
baseline**, not a capacity test.

- `.github/workflows/load-test.yml` runs nightly at **25 VUs / 1 min** on
  a **2-vCPU CI runner** (manual default 50 VUs). `tests/load/*.js`
  thresholds are *deliberately wider than the SLOs* (`p95<800ms` vs the
  SLO read target `<500ms`) and the file literally labels them
  "SMOKE-TIER … would need warmup + steady-state."
- So: **small** is *loosely observed* (that concurrency sits in its
  band, `http_req_failed<0.01`); **medium / large / enterprise are
  extrapolated and untested.** The doc says so in the intro, the table's
  Provenance column, and a machine-readable `<!-- sizing-provenance -->`
  block. I did **not** dress the smoke run up as a capacity proof.

This corrects the task brief's premise that "small + medium are covered
by load-test runs today" — medium (≤200 RPS) is not; 25–50 VUs ≠ 200 RPS.

## Tier threshold rationale

- **medium = the shipped chart defaults** (HPA 2→10, worker ×2) — the
  anchor, so an un-tuned prod install lands here.
- Other tiers scale roughly linearly off the per-pod envelope (1 vCPU
  request / 2 vCPU limit, CPU-bound HPA at 70%). The tenant-per-pod rule
  (~150–250 *active* tenants/pod; active = request in last 10 min) is a
  seed, flagged as not-yet-measured.
- Postgres/Redis instance classes are starting suggestions (data volume
  varies); the doc points at Aurora read-replica offload + Redis cluster
  as the vertical→horizontal escape hatches.

## Real signals (no fabricated panel IDs)

The "when to upgrade" + per-component "outgrown when" signals use the
ACTUAL metric/recording-rule/alert names from
`docs/observability/03-prometheus-grafana.md`: `api_request_count_total`
(RPS), `job:api_request_duration:p95_5m` (vs SLO ceilings in
`docs/slos.md`), `job_queue_depth{queue_state="waiting"}` (alert >500/15m),
`job_execution_count_total{job_status}`, plus RDS CPU (CloudWatch — noted
as out-of-Prometheus), Redis `evicted_keys`, PgBouncer `cl_waiting`.
Grafana dashboards are cited as JSON-as-code
(`infra/observability/grafana/dashboards/*.json`) — there are no stable
numeric panel IDs to cite, so I didn't invent any.

## Files
`docs/sizing.md` (new) · `docs/deployment.md` (+ sizing cross-link) ·
`infra/helm/inflect/README.md` (+ pointer) ·
`tests/guardrails/sizing-doc-coverage.test.ts` (5-assertion ratchet:
tiers, components, SLO + observability cross-refs, per-tier provenance
marker).
