# 2026-06-25 — traceparent propagation web → BullMQ worker

**Commit:** `feat(observability): traceparent propagation web → BullMQ worker`

## Design

The BullMQ worker ran without OTel initialised, so background work was
invisible to Tempo and any trace ended at `queue.add(...)`. This change
threads the W3C `traceparent` (+ `tracestate`) from the web tier into
the job payload at enqueue, extracts and activates it in the worker on
pickup, and runs the job inside a span that is a child of the
originating HTTP-handler span — so the request and its async work are
one continuous trace.

A single seam module (`src/lib/observability/job-trace.ts`) owns the
mechanism; `queue.ts` injects, `worker.ts` extracts + runs. Full
operator guide and flow diagram in `docs/observability/05-job-tracing.md`.

## Files

| File | Role |
|------|------|
| `src/lib/observability/job-trace.ts` | **new** — `OTEL_CARRIER_KEY`, `captureTraceCarrier`/`readTraceCarrier`/`stripTraceCarrier`, and `runJobInTraceContext` (extract → `context.with` → active span, OK/ERROR status). |
| `src/app-layer/jobs/queue.ts` | `enqueue()` now wraps the add in an `enqueue <name>` active span, `propagation.inject`s the active context into a carrier, and attaches it under `OTEL_CARRIER_KEY`. Carries canonical `messaging.*` attributes. |
| `scripts/worker.ts` | `bootstrap()` `await`s `initTelemetry()` before `new Worker(...)`; the processor runs the executor through `runJobInTraceContext` on the stripped payload; shutdown drains via `shutdownTelemetry()`. |
| `infra/observability/grafana/dashboards/inflect-jobs-and-queues.json` | Duration panel description points operators at the Tempo exemplar link + TraceQL search. |
| `infra/observability/grafana/dashboards/inflect-api-overview.json` | Latency panel description notes downstream worker spans are now in the request trace. |
| `docs/observability/05-job-tracing.md` | **new** — operator runbook + flow diagram. |
| `docs/observability/README.md` | Index row for doc 05. |
| `tests/guardrails/job-trace-propagation.test.ts` | **new** — structural ratchet over the four moving parts. |
| `tests/integration/job-execution-with-trace.test.ts` | **new** — real OTel SDK, asserts the span hierarchy across the boundary. |

## Decisions

- **One seam module, not inline everywhere.** `job-trace.ts` is the
  single owner of the carrier key and the extract/activate dance. Both
  the producer (`queue.ts`) and consumer (`worker.ts`) reach the carrier
  key through it — the ratchet asserts neither hand-spells
  `__otel_carrier`. This also makes the worker-side logic importable by
  the integration test without importing `worker.ts` (a script
  entrypoint that connects Redis on import).

- **Inject INSIDE the `enqueue` span**, not before it. The carrier
  therefore points at the `enqueue` span, so the worker's `execute`
  span nests under it → under the HTTP span. Hierarchy is
  `HTTP ▸ enqueue ▸ execute`, the clean three-level chain, rather than
  the `enqueue` and `execute` spans being flat siblings of the HTTP
  span.

- **No auto-instrumentation package.**
  `@opentelemetry/instrumentation-bullmq` is not an official
  OTel-scoped package; adding it would have to clear the MODERATE+
  npm-audit gate this repo enforces, and it would partially duplicate
  our manual spans. We set the canonical `messaging.*` semantic-
  convention attributes by hand instead — same queryable-by-queue
  outcome, zero new dependency. This is the one deliberate deviation
  from the original spec's gap #4.

- **Worker-init sequencing is load-bearing _because the tracer
  provider is global state_**, not because of monkey-patching (we add
  none). `startActiveSpan` is a no-op until `initTelemetry()` registers
  a real provider, so `bootstrap()` awaits it before the first
  `new Worker(...)`. `commonjs` module type rules out top-level await,
  hence the async `bootstrap()` wrapper with `worker`/`connection`
  hoisted to module scope so the shutdown handler can still close them.

- **Carrier is stripped before the executor and before logging.**
  Executors get only their typed `JobPayload<T>`. The `__otel_carrier`
  key is internal plumbing — a review sentinel in the code + docs flags
  that it must never be logged or shipped in audit-stream events.

- **Graceful degradation for legacy jobs.** A job enqueued before this
  shipped has no carrier; `readTraceCarrier` returns `{}` and the
  worker simply starts a fresh root trace (covered by an integration
  case).

- **Dashboards: description, not a hand-built deep-link.** The
  "data-link with `traceID`" is already provisioned at the datasource
  level (`exemplarTraceIdDestinations` → `tempo`), which applies to any
  panel exposing exemplars. A hand-encoded Grafana Explore URL would be
  unverifiable across Grafana versions, so the panels instead carry a
  description pointing at the exemplar link + the TraceQL search.
  True per-datapoint exemplar links light up once the app emits
  histogram exemplars — a separate follow-up, noted in doc 05.
