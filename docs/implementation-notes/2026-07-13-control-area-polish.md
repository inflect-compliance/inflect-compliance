# 2026-07-13 — Control-area polish sweep (R2-P4)

**Commit:** _(R2-P4 of the controls-posture roadmap)_

## Design

Six small control-area UX inconsistencies from the audit, batched. Pure polish
— no schema or lifecycle change.

1. **Evidence count agreement.** The list Evidence column read
   `_count.evidenceLinks` alone while the detail Evidence tab badge counts
   `evidenceLinks + evidence` (links + direct Evidence entities). `controlListSelect`
   now counts `evidence` too and the column sums both, so the same control shows
   one number everywhere.
2. **Load failures surfaced.** `ControlRoiCard` returned `null` on fetch error
   (a silent disappearance); it now shows a small "couldn't load" + retry.
   `ControlBiaSurface` did not even read `error` — now it does and offers a
   recoverable notice.
3. **Humanized check status.** The Checks tab printed the raw enum
   (`PASSED`/`FAILED`/`ERROR`/`NOT_APPLICABLE`); it now maps through the
   localized labels P2 added under `controls.health.checkStatus.*` (unknown
   statuses fall back to raw so a new enum member never crashes the render).
4. **(Already done in R2-P2.)** The evidence-title deep-link → the specific
   record (`/evidence?ev=<id>`) — no change here.
5. **Client navigation on Coverage.** `CoverageClient` row clicks used
   `window.location.href` (full page reload) → `router.push`.
6. **Applicability three states.** The enum holds only APPLICABLE /
   NOT_APPLICABLE, but a never-assessed control is stored as APPLICABLE and read
   identically to a deliberately-assessed one. `controlListSelect` now carries
   `applicabilityDecidedAt`; the column shows **Applicable** (decided) / **Not
   applicable** / **Not assessed** (APPLICABLE with a null decision timestamp).

## Decisions

- **"Not assessed" keys on `applicabilityDecidedAt`, not a new enum value.**
  Adding a third enum member would be a migration + a lifecycle change; the
  assessed-ness signal already exists in the nullable `applicabilityDecided*`
  columns, so the three-state read is pure presentation.

## Files

| File | Role |
|---|---|
| `src/app-layer/repositories/ControlRepository.ts` | list select: `evidence` count + `applicabilityDecidedAt` |
| `.../controls/ControlsClient.tsx` | evidence column sum; applicability 3-state |
| `.../controls/[controlId]/_components/ControlRoiCard.tsx` | error + retry |
| `src/components/bia/ControlBiaSurface.tsx` | error + retry |
| `.../controls/[controlId]/_tabs/ControlChecksTab.tsx` | humanized status |
| `.../coverage/CoverageClient.tsx` | `router.push` |
| `messages/{en,bg}.json` | notAssessed / roi.loadError / bia.loadError |
| `tests/guards/p4-control-polish.test.ts` | ratchet |
