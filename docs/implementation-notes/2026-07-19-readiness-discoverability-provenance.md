# 2026-07-19 — Audit-readiness discoverability + provenance

**Commit:** `<pending> feat(audits): hub cycle picker, finding audit provenance, per-kind materialize, cycle polish`

## Design

The companion to the readiness plumbing-correctness PR. Where that one
fixed what the scoring *computed*, this one fixes what a user can *reach*
and *attribute*.

1. **Hub cycle filter is now reachable.** `/audits?cycleId=…` scoped the
   fieldwork-audit list, but nothing in the UI set it — the only way in was
   the cycle-detail "view in hub" link or hand-editing the URL. And the
   active-filter banner said "Showing fieldwork audits for one cycle",
   naming nothing. Added a **cycle picker** (`audits-cycle-picker`) fed by
   `CACHE_KEYS.audits.cycles()`, with an explicit "All fieldwork audits"
   entry that clears the filter; the banner now names the selected cycle
   (`hub.cycleFilterActiveNamed`). The picker only renders when the tenant
   actually has cycles.

2. **Register-created findings can carry audit provenance.**
   `CreateFindingSchema` has always accepted `auditId`, and
   `createFinding` persists it (`auditId: data.auditId || null`) — but
   `CreateFindingModal` captured no audit, so a finding raised from the
   register was permanently orphaned from its cycle (readiness reaches a
   finding's cycle only via `Finding.audit.auditCycleId`). Added an
   optional **originating-audit picker**. No schema or usecase change was
   needed — this was purely a missing capture surface.

3. **Materialize affordance is precise.** The pack return-channel's button
   read "Create finding" for both a `FINDING` and an `EVIDENCE_REQUEST`,
   though they materialise into *different* finding types
   (`NONCONFORMITY` vs `OBSERVATION`). Label is now per kind — "Create
   finding" / "Create observation". Separately, the audit the materialised
   finding attaches to (the cycle's oldest fieldwork audit) looked
   arbitrary; the choice is now **documented as deterministic** rather than
   changed: any audit in the cycle satisfies the readiness join equally,
   and oldest-by-`createdAt` is stable as later audits are added, so
   idempotent re-runs always resolve to the same audit. A per-audit
   reviewer picker stays out of scope — readiness consumes the cycle
   linkage, not the specific audit.

4. **Polish.** Raw status enums no longer leak into the cycle-list card
   (now `cycleStatus.*`) or the cycle-detail fieldwork badges (now the flat
   audit-status keys). Custom-framework cycles get a generic-but-branded
   chip via a shared `fwMeta()` fallback instead of the flat gray "unknown"
   look. The `FindingRepository` list-select comment claimed the `audit`
   relation was excluded "the page never reads on the list view" — it has
   been selected since `feat/audit-cycle-unify`; the comment now describes
   the select it actually documents.

## Files

| File | Role |
| --- | --- |
| `src/app/t/[tenantSlug]/(app)/audits/AuditsClient.tsx` | Cycle picker + named active-filter banner (1) |
| `src/app/t/[tenantSlug]/(app)/findings/CreateFindingModal.tsx` | Optional originating-audit picker + `auditId` in payload (2) |
| `src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/page.tsx` | Per-kind materialize label (3) |
| `src/app-layer/usecases/audit-readiness/sharing.ts` | Documented deterministic audit choice (3) |
| `src/app/t/[tenantSlug]/(app)/audits/cycles/page.tsx` | Localized status + branded `fwMeta()` fallback (4) |
| `src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/page.tsx` | Localized fieldwork-audit status badges (4) |
| `src/app-layer/repositories/FindingRepository.ts` | Corrected stale list-select comment (4) |
| `tests/guards/readiness-discoverability-provenance.test.ts` | Structural ratchet over all four |

## Decisions

- **Document the oldest-audit choice rather than add a picker.** The
  finding's cycle linkage is what readiness scoring consumes; which
  fieldwork audit within the cycle carries it is immaterial to every
  consumer today. A reviewer picker would add a modal step to a
  one-click action for no behavioural gain — but the *arbitrariness* was
  a real review smell, so the rationale is now written where the query is.
- **No schema change for finding provenance.** The `auditId` seam already
  existed end-to-end; only the capture surface was missing. Resisting a
  schema change kept this a UI-only diff.
- **Picker hidden when there are no cycles.** A tenant that has never
  created a cycle sees no dead control — the hub degrades to its previous
  unscoped shape.
