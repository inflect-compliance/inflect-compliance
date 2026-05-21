# 2026-05-21 — Audit-stream delivery observability

**Commit:** `<pending> feat(observability): production-grade OTel metrics for audit-stream delivery`

## Design

`audit-stream.ts` (Epic C.4 / E.2) forwards committed audit rows to a
tenant-configured SIEM. Before this change its only durable failure
signal was one OTel counter (`audit_stream.delivery.failures`) plus
`logger.warn`; a module-level `_deliveryFailureCount` existed purely
as a test shim. Operators could see *that* failures happened but had
no view of the success ratio, retry pressure, latency, or buffer
backlog — and no clear escalation model.

This change instruments the full delivery path. `deliverBatch` calls
`recordAuditStreamDelivery` ONCE per batch, after the retry loop
settles:

| Metric | Type | Labels | Answers |
|--------|------|--------|---------|
| `audit_stream.delivery.success` | Counter | `http.status_code` | Are batches landing? |
| `audit_stream.delivery.failures` | Counter | `http.status_code` | (kept) failure count |
| `audit_stream.delivery.attempts` | Histogram | `outcome` | Is the downstream flaky? (1 = no retry … 3) |
| `audit_stream.delivery.duration` | Histogram | `outcome` | How slow is delivery? [ms] |
| `audit_stream.buffer.overflow_dropped` | Counter | — | Are events being shed under pressure? |
| `audit_stream.buffer.depth` | Observable Gauge | — | Is delivery keeping up with ingestion? |

`success + failures` gives the **delivery success ratio**.
`attempts` makes **retry behaviour** visible. `buffer.depth` +
`overflow_dropped` show **downstream backpressure** — a sustained
non-zero overflow rate means the SIEM cannot keep up and audit
events are being dropped from the stream (they remain in the audit
table — never lost, just not forwarded).

Cardinality is bounded exactly as the rest of `metrics.ts`: only
`http.status_code` (finite) and `outcome` (success|failure).
`tenantId` is never a metric label — per-tenant debugging uses the
structured `logger.warn` that still fires in the same code path.

### Failure semantics + operator visibility

Audit-stream failures **deliberately do NOT gate `/api/readyz`**.
The path is out-of-band and fail-safe by design — the audit row is
committed before streaming is attempted, so a broken SIEM never
costs data and must never take the app out of load-balancer
rotation. Coupling readiness to a non-critical downstream would be
a self-inflicted outage.

Escalation is therefore **alert-based on the metrics**, not
health-check-based. Recommended operator alerts:
- success ratio `success / (success + failures)` drops below an SLO;
- `buffer.overflow_dropped` rate > 0 (audit events being shed);
- `buffer.depth` sustained high (delivery falling behind).

`_deliveryFailureCount` (the in-memory test shim) is removed; tests
now assert on the `recordAuditStreamDelivery` call via a jest mock —
the standard "this code emits the metric" pattern, no parallel
counter to drift.

## Files

| File | Role |
|------|------|
| `src/lib/observability/metrics.ts` | New audit-stream instruments + `recordAuditStreamDelivery`, `recordAuditStreamBufferOverflow`, `startAuditStreamBufferReporting`. `recordAuditStreamDeliveryFailure` removed (folded into the unified recorder). |
| `src/app-layer/events/audit-stream.ts` | `deliverBatch` records the outcome (success/failure + attempts + duration); `streamAuditEvent` records buffer overflow; the buffer-depth gauge is registered on module init. `_deliveryFailureCount` + its `__get/__reset` seam removed. |
| `tests/unit/audit-stream.test.ts` | Retry tests assert via the metric mock; new "delivery metrics" describe. |
| `CLAUDE.md` | Epic E.2 section updated — the OTel metric set replaces the "future work wires this to OTel" TODO. |

## Decisions

- **One recorder per batch, not per attempt.** `recordAuditStreamDelivery`
  is called once after the retry loop settles — the `attempts`
  histogram carries retry pressure, so per-attempt metrics would be
  redundant cardinality.

- **`failures` counter kept, `success` added.** Renaming
  `audit_stream.delivery.failures` to a unified `{outcome}` counter
  would break any alert already built on it. Additive instead: keep
  `failures`, add `success`; the ratio is `success/(success+failures)`.

- **No readiness coupling — documented, not coded.** The prompt
  asked to "clarify whether failures should escalate into health
  thresholds". The answer is a deliberate NO, for an out-of-band
  fail-safe path; the clarification IS the deliverable.

- **Buffer-depth gauge registered at module init.** `audit-stream.ts`
  is lazy-imported; registering the observable gauge on its module
  load is cheap (the callback only runs at scrape time) and needs no
  separate wiring from an entrypoint.
