# Integration & check observability — operator runbook

Inflect is a monitoring product whose defining failure mode is a check going
green — or a sync corrupting data — **silently**. The generic
`job.execution.count` only reflects whether the job *wrapper* returned; it stays
`success` even when a collector internally recorded `ERROR`, resolved a false
`PASSED`, or a sync deprovisioned the tail. The domain metrics below (module
`src/lib/observability/integration-metrics.ts`) make each of those alertable.

All of these are **out-of-band + fail-safe** — none gate `/api/readyz` (like the
audit-stream metrics, escalation is alert-based, not readiness-based).

## Metrics

| Metric | Type | Labels | Emitted from |
| --- | --- | --- | --- |
| `integration.check.outcome` | counter | `provider`, `check.type`, `status` | `automation-runner` on every `IntegrationExecution` finalize |
| `integration.check.duration` | histogram (ms) | same | same |
| `integration.check.staleness_seconds` | observable gauge | `provider` | in-memory; seconds since the provider's last recorded outcome |
| `integration.sync.truncated` | counter | `provider` | identity-sync / hris-sync when an enumeration hits the cap |
| `integration.identity.deprovisioned` | counter | `provider` | identity-sync reconcile (adds the batch size) |
| `integration.device.report` | counter | — | `reportDevice` on every ingest |
| `ai.generation.count` | counter | `feature` | questionnaire (per question) + assistant (per ask) |
| `ai.generation.tokens` | histogram | `feature` | when the provider reports token usage |

`status` includes `NOT_APPLICABLE` (H2) as a first-class value so "went green"
is distinguishable from "no data" on the dashboard.

## Alert conditions

| Condition | Signal | Why |
| --- | --- | --- |
| Collector error surge | `rate(integration.check.outcome{status="ERROR"})` climbs | a broken/revoked-credential collector (H2 fail-closed) |
| Silently-dead collector | `integration.check.staleness_seconds{provider}` `> 7d` | a provider stopped emitting outcomes entirely (H2-C1) |
| Silent truncation | `increase(integration.sync.truncated) > 0` | a directory/roster larger than the cap (H3) — data-integrity risk |
| Wrongful mass-deprovision | `increase(integration.identity.deprovisioned)` spikes vs baseline | the H3 wrongful-deprovision signature |
| Device-report abuse | `rate(integration.device.report)` spikes | a leaked/looping device token (H3) |
| AI cost spike | `rate(ai.generation.count)` / `ai.generation.tokens` climbs | the H4 questionnaire amplification |

Tune thresholds per tenant volume; the truncation + deprovision-spike alerts
should be **page-worthy** (silent data corruption), the rest ticket-worthy.

## Not on the readyz path

These are deliberately kept off `/api/readyz` (`src/app/api/readyz/route.ts`) —
the check/sync paths are out-of-band and fail-safe (the execution row is already
committed), exactly like the audit-stream delivery metrics. A dead collector is
an alert, not a reason to fail readiness and roll back a deploy.
