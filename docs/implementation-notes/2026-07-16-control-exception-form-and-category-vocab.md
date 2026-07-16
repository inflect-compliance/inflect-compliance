# 2026-07-16 — Control exception form + one category vocabulary + dead-code removal

**Commit:** `<pending> fix(controls): wire exception form, unify category vocabulary, delete dead ControlDetailSheet`

## Design

Three primary-flow defects on the control surfaces.

### 1 · Exception request form
- `compensatingControlChoices` was hardcoded `[]` on the detail page, so the
  compensating-control combobox was always empty. The page has no controls
  roster in scope, so a lightweight `useTenantSWR(CACHE_KEYS.controls.list())`
  fetch now feeds `{ id, name, code }[]` (the `GET /controls` unbounded branch
  returns `{ rows }`).
- "Risk accepted by" was a raw user-ID `<input>`; it's now a `<UserCombobox>`
  (name-selectable, defaulting to the control owner), matching
  `EditControlModal`. `tenantSlug` is threaded into `RequestExceptionDialog`.

### 2 · One category vocabulary
The three editing surfaces disagreed: the create modal + list quick-edit panel
used a free-text list ("Access Control", "Encryption", …) while the detail edit
modal used the four ISO 27002:2022 themes — so a free-text control opened in the
detail editor read as "None" and a save could silently coarsen or clear it.
(Note: the prompt's premise that the quick-edit panel used themes was stale — it
used the same free-text list as the create modal; and framework-seeded controls
use a *third*, granular ISO-domain / SOC 2 vocabulary.)

Canonical vocabulary = the **four ISO 27002:2022 themes**
(`ORGANIZATIONAL / PEOPLE / PHYSICAL / TECHNOLOGICAL`), in a shared const
`src/lib/controls/control-categories.ts`. All three editing surfaces build their
options from it. Crucially, `buildCategoryOptions(currentValue, labelFor)` (and
`EditControlModal`'s equivalent) **preserve a non-theme current value as its own
option** so a legacy / framework-seed / custom category displays honestly and
round-trips — the editor never silently drops a value it merely failed to
resolve. Migration `20260716160000_normalize_control_category` maps the known
legacy free-text values to themes (`Other → NULL`); framework-seed granular
domains are intentionally left alone (their list/browse grouping is derived by
`categorizeControl`, and the preserve-as-option behaviour keeps them editable).

### 3 · Dead `ControlDetailSheet`
The 476-line `ControlDetailSheet.tsx` was imported by nothing (the list
quick-view is `ControlEditPanel`). Removed the component + its unit test; the
several guard/unit ratchets that scanned it by path had that entry removed. The
stale `ControlsClient.tsx` comment (and an `EvidenceDetailSheet` doc-comment)
that named it were corrected.

### 4 · Minor cleanup
- Removed the permanently-true `|| true` on the detail page's sync-banner guard
  (`syncBanner` only has content for non-`NONE` states, so the guard is now
  honest).
- **Create stays lightweight by design** — `objective` / `successCriteria` /
  `testingMethodology` are `.strip()`ped by `CreateControlSchema` and absent
  from `NewControlModal`; they're edit-only (the internal-controls fields on the
  detail Overview/Tests tabs). Documented here rather than expanding the create
  modal.

## Files

| File | Role |
| --- | --- |
| `src/lib/controls/control-categories.ts` | New — canonical themes + `buildCategoryOptions` + legacy→theme map. |
| `prisma/migrations/20260716160000_normalize_control_category/migration.sql` | Normalize legacy free-text categories → themes. |
| `NewControlModal.tsx` · `ControlEditPanel.tsx` · `_modals/EditControlModal.tsx` · `[controlId]/page.tsx` | Category pickers → shared themes + preserve non-theme value. |
| `[controlId]/page.tsx` · `ControlExceptionsPanel.tsx` | Exception form: roster fetch + `UserCombobox` risk-acceptor. |
| `[controlId]/page.tsx` | Removed `\|\| true`. |
| `ControlsClient.tsx` · `evidence/EvidenceDetailSheet.tsx` | Fixed comments naming the deleted component. |

## Decisions

- **ISO 27002:2022 themes as the canonical editable vocabulary** — coarse but
  clean, matches the framework's own top-level structure, and the only value set
  the detail editor already constrained to.
- **Preserve-not-overwrite over aggressive migration** — migrating only the
  known free-text strings (not the granular framework-seed domains) avoids
  breaking `categorizeControl`'s SOC 2 fallback; the preserve-as-option
  behaviour guarantees no silent loss regardless of what's persisted.
