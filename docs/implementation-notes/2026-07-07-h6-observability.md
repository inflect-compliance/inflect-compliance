# 2026-07-07 — H6: integration observability (make a broken check visible)

**Commit:** `<pending>` feat(h6): check-outcome / sync-integrity / freshness / AI metrics + runbook

## Design

A monitoring product whose defining failure mode (H2/H3) is a check going green
or a sync corrupting data SILENTLY. The only pre-existing signal on the new jobs
was the generic `job.execution.count`, whose `success` flag is true as long as
the job WRAPPER returned — even when a collector internally recorded ERROR,
resolved a false PASSED, or a sync deprovisioned the tail. None of the H2/H3
failure modes were alertable. H6 adds the domain metrics.

New module `src/lib/observability/integration-metrics.ts` (mirrors the lazy
`getMeter()` pattern in `metrics.ts`):

- `recordCheckOutcome` (counter `integration.check.outcome` + duration
  histogram) — called wherever an `IntegrationExecution` is finalized
  (`automation-runner`). `NOT_APPLICABLE` is first-class, so "went green" vs
  "no data" is distinguishable.
- `integration.check.staleness_seconds` — an in-memory observable gauge, per
  provider seconds-since-last-outcome. A silently-dead collector stops emitting,
  so its staleness climbs without bound (the H2-C1 "dead for a week" detector).
  In-memory ⇒ no per-scrape DB query.
- `recordSyncTruncated` (`integration.sync.truncated`) — identity + HRIS, the
  H3 silent-truncation signature.
- `recordIdentityDeprovisioned` (`integration.identity.deprovisioned`, adds the
  batch size) — a spike is the H3 wrongful-mass-deprovision signature.
- `recordDeviceReport` — device-report ingest counter (no tenant label; a
  looping token surfaces as a global-rate spike, H3).
- `recordAiGeneration` (`ai.generation.count` + `ai.generation.tokens`) —
  per-feature, the H4 amplification visibility.

Freshness gauge registered at both startup entry points
(`instrumentation.ts` + `scripts/worker.ts`), next to the H1 provider bootstrap.

## Files

| File | Role |
| --- | --- |
| `src/lib/observability/integration-metrics.ts` | all recorders + the freshness gauge |
| `src/app-layer/jobs/automation-runner.ts` | `recordCheckOutcome` at finalize |
| `src/app-layer/usecases/identity-sync.ts` | truncated + deprovisioned |
| `src/app-layer/usecases/hris-sync.ts` | truncated |
| `src/app-layer/usecases/device.ts` | device-report ingest |
| `src/app-layer/usecases/{questionnaire,assistant}.ts` | AI generation |
| `src/instrumentation.ts`, `scripts/worker.ts` | register freshness gauge |
| `docs/integration-observability.md` | operator runbook + alert thresholds |

## Decisions

- **Off the readyz path.** Deliberately out-of-band + fail-safe, like the
  audit-stream metrics — a dead collector is an alert, not a readiness failure
  that rolls back a deploy.
- **In-memory freshness, not a per-scrape DB query.** A per-connection DB-backed
  gauge would query on every metric scrape (15–60 s) cross-tenant; the
  per-provider in-memory staleness is the same "silently dead" detector without
  that load. A per-connection admin health view (mirroring
  `providers/sharepoint/health.ts`) is a tracked follow-up.
- **No tenant-id labels** (cardinality) — abuse/amplification surfaces as
  global-rate + per-provider/feature spikes, consistent with the
  business-metrics convention.
