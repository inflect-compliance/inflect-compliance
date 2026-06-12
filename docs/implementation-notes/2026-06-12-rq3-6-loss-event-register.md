# 2026-06-12 — RQ3-6: the loss-event register — forecasts meet reality

**Commit:** _(see PR — `feat(rq3-6): loss-event register — forecasts meet reality`)_

## Design

The system predicted losses everywhere (FAIR ALE, Monte Carlo
P50/P90, LEC) and never recorded them. A forecasting system that
never scores its forecasts isn't analytics — it's theology. The
single highest-integrity move on the roadmap: introduce the
`LossEvent` model so the forecasting stack becomes falsifiable.

**Model.** `LossEvent` in `prisma/schema/compliance.prisma` carries
`tenantId`, optional `riskId` (FK with `onDelete: SetNull` — a loss
attributed to a risk survives the risk's hard delete), `occurredAt`
(calendar date — finance, not telemetry), `amount` (currency = the
tenant's `currencySymbol`, OB-A), `description` + `justification`
(free-text), `source` (`LossEventSource: USER | FINDING | INCIDENT`,
the RQ2-1-style provenance dimension), `createdByUserId`,
`createdAt`, and a `deletedAt` soft-delete column (historical
predictions can still see the actual that came in before
reclassification). Three indexes back the access paths the overlay
uses: `(tenantId, occurredAt)`, `(tenantId, riskId, occurredAt)`,
`(tenantId, createdAt)`.

**Migration + RLS.**
`prisma/migrations/20260612040000_rq3_6_loss_event_register/`
creates the table + enum + indexes and ships the canonical Class-A
RLS pairing: `tenant_isolation` (USING) + `tenant_isolation_insert`
(WITH CHECK) + `superuser_bypass`. The `rls-coverage.test.ts`
ratchet auto-discovers the new tenant-scoped model and enforces the
policy presence without a list update; the RQ3-6 ratchet
additionally pins each `CREATE POLICY` line so a future migration
that drops one fails CI.

**Encryption.** `LossEvent: ['description', 'justification']` joins
the Epic B manifest. Loss narratives ("Customer breach response,
vendor X") are confidential business content — the attacker value
if leaked is comparable to the Finding rows.

**Sanitisation.** The usecase routes both free-text fields through
`sanitizePlainText` (Epic D.2) BEFORE the encryption middleware
writes them — so every decryptor (UI, PDF, audit-pack share link)
reads safe HTML, not just the renderer.

**Audit + ADMIN-only delete.** Every create emits
`LOSS_EVENT_RECORDED` carrying `{source, amount, riskId}` in
`detailsJson`. Soft-delete is `assertCanAdmin`-only and audits
`LOSS_EVENT_REMOVED` — actuals are evidence; an EDITOR flow must not
destroy them silently.

**API.** Three routes under `/api/t/:slug/loss-events`:
- `GET /` — cursor-paginated list with optional `?riskId=`;
- `POST /` — record an event (`withValidatedBody` + Epic A.2
  mutation rate limit by default);
- `GET /aggregate` — the predicted-vs-actual roll-up (`{total,
  count, byYear[], byRisk[]}`), aggregated server-side so the
  client never holds raw row volume;
- `DELETE /:id` — ADMIN-only soft delete.

**The page.** `/risks/loss-events` mounts three sections:
1. The roll-up card with three KPI tiles (Total / Count / Years)
   and per-year mini-bars; the simulator's latest Mean / P90 lands
   beside as the honest reference line. The empty state explains
   why this matters in one sentence ("the forecasting stack is
   unfalsifiable until losses come back in").
2. The "Record loss" form (date, amount, what-happened, source
   chips).
3. The recent register (descending `occurredAt`, source chip,
   ADMIN remove affordance).

The page links from the existing risks header's `RISK_VIEW_LINKS`
strip alongside Scenarios / Hierarchy / KRI / Reports.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` + `enums.prisma` | `LossEvent` model + `LossEventSource` enum + back-relations |
| `prisma/migrations/20260612040000_rq3_6_loss_event_register/` | table + indexes + RLS triplet |
| `src/lib/security/encrypted-fields.ts` | `LossEvent: ['description', 'justification']` |
| `src/app-layer/usecases/loss-event.ts` | list / aggregate / create / soft-delete |
| `src/app/api/t/[tenantSlug]/loss-events/{route,aggregate/route,[id]/route}.ts` | three thin routes |
| `src/app/t/[tenantSlug]/(app)/risks/loss-events/page.tsx` | the register surface |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | header link |
| `tests/guards/rq3-6-loss-event-register.test.ts` | the ratchet |
| `tests/integration/loss-event.test.ts` | round-trip + sanitisation + audit + ADMIN-only delete |

## Decisions

- **Aggregate server-side, not client-side.** The roll-up endpoint
  emits `byYear` + `byRisk` in one pass; the page never holds the
  raw row list. Keeps the predicted-vs-actual overlay cheap and
  the page suitable for a small operator screen.
- **Calendar year buckets.** The simulator's "per year" reads as
  "annualised"; comparing actuals on a calendar-year axis is the
  honest unit. Rolling-12-month or fiscal years would be more
  flexible but read as "you fiddled the comparison" without a clear
  win.
- **Soft delete + ADMIN gate.** Actuals are evidence — for the
  predicted-vs-actual story to mean anything, deletion has to be a
  conscious admin act, and a removed row has to leave a record (the
  audit trail + the row itself, retrievable).
- **Per-risk attribution optional.** Some losses are portfolio
  (third-party regulatory action, supply-chain) — forcing a riskId
  would invent attributions. Null riskId rolls up into the
  portfolio bucket and the dashboard surfaces it as such.
- **Ratchet shape** (`rq3-6-loss-event-register.test.ts`): pins the
  model shape + enum, every `CREATE POLICY` line in the migration,
  the encryption manifest entry, the usecase contract (sanitisation
  + audit + ADMIN-only delete + soft-delete filter), the three
  route exports, and the page's overlay + form + register testids
  + the empty-state explanation that makes the feature read.
