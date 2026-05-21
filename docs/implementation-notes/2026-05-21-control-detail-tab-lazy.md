# 2026-05-21 — Control detail: tab-lazy data loading (#102 item 1)

**Commit:** `<pending> perf(controls): tab-lazy control detail — header-only page-data + per-tab fetches`

## Problem

The control detail page-data payload eager-loaded four heavy
relation arrays — `controlTasks`, `evidenceLinks`, `evidence`,
`frameworkMappings` — on every load, via `ControlRepository.getById`.
The Overview tab (the default) reads none of them. #101 trimmed the
unused `risks` / `policyLinks` / `_count`; the bigger split was
deferred as #102 item 1 because it needed a real refactor.

## Design

Split the read along the tab boundary.

**Server.** New `ControlRepository.getHeaderById` — control scalars,
the three lightweight user refs, `contributors`, and a `_count` for
the four tabbed relations (so the tab badges still render). It does
NOT load the arrays. `getControlHeader` wraps it and adds
`doneControlTasks` (a filtered `controlTask.count` — `_count` can't
carry both a total and a filtered count for one relation; the
Overview "Tasks Progress" widget needs the DONE count).
`getControlPageData` now calls `getControlHeader`. `getById` /
`getControl` are untouched — the plain `GET /controls/{id}` endpoint
still returns the full shape.

Each heavy tab gets a GET endpoint:
- Tasks — `GET /controls/{id}/tasks` already existed.
- Evidence — `GET /controls/{id}/evidence` expanded from links-only
  to `{ links, evidence }` (no GET consumer existed, so the shape
  change is safe). Backed by new `getControlEvidenceTab`.
- Mappings — `GET /controls/{id}/requirements` is new (the route had
  POST/DELETE only). Backed by new `listControlMappings` +
  `ControlRepository.listFrameworkMappings`.

**Client.** The Tasks / Evidence tab bodies fetch their own slice
via `useTenantSWR` with a key gated on the active tab (`null` until
opened — mirrors the existing Activity / Traceability / Tests
panels). Tab badges + Overview progress read `control._count.*` /
`control.doneControlTasks`. The Epic-67 undo-toast optimistic
updates (`unlinkEvidence`) now mutate the per-tab SWR cache, not the
page-data envelope.

The **Mappings tab was extracted whole** into
`_tabs/ControlMappingsTab.tsx` — fetch, framework/requirement
pickers, map/unmap handlers, JSX. This was forced by the
`controls-detail-page-size` ratchet (the tab-lazy machinery added
~60 lines; extraction removed ~165 net), and it advances the page's
documented ≤300-line decomposition goal. The page dropped 1508 →
1403 lines.

## Files

| File | Role |
|------|------|
| `repositories/ControlRepository.ts` | `getHeaderById` (no heavy arrays, `_count`) + `listFrameworkMappings` |
| `usecases/control/queries.ts` | `getControlHeader` (+ `doneControlTasks`) |
| `usecases/control/page-data.ts` | `getControlPageData` → `getControlHeader` |
| `usecases/control/evidence.ts` | `getControlEvidenceTab` — `{ links, evidence }` |
| `usecases/control/templates.ts` | `listControlMappings` |
| `api/.../controls/[controlId]/requirements/route.ts` | new GET |
| `api/.../controls/[controlId]/evidence/route.ts` | GET → combined payload |
| `controls/[controlId]/page.tsx` | per-tab `useTenantSWR`; `_count` badges; Mappings tab extracted |
| `controls/[controlId]/_tabs/ControlMappingsTab.tsx` | **NEW** — self-contained Mappings tab |
| `lib/dto/control.dto.ts` | `_count.frameworkMappings` added |
| `lib/swr-keys.ts` | `controls.{tasks,evidence,mappings}` keys |

## Decisions

- **`getControl` / `getById` left intact.** Other callers (the plain
  detail endpoint, `getControlActivity`'s existence check) still
  want the full shape. The split is additive — a new header getter,
  not a mutation of the existing one.
- **Evidence GET shape changed, not added-alongside.** A grep
  confirmed nothing consumed the old links-only `GET /evidence`
  response, so returning `{ links, evidence }` breaks no caller and
  avoids a second endpoint.
- **Badge counts via `_count`, not live arrays.** The Evidence badge
  is `evidenceLinks + evidence` counts; the prior exact de-dup of a
  file-backed Evidence row already linked is dropped — a badge
  tolerates the rare double-count. Create/link/map handlers refetch
  page-data so the badge stays current.
- **Mappings tab fully extracted; the others migrated in place.**
  Extraction was driven by the page-size ratchet, and the Mappings
  tab is the cleanest unit — after the refactor it owns its own
  fetch, so moving its state + effects + handlers out is a clean
  vertical slice. Tasks / Evidence stayed in place because they
  share the page's file-upload / task-form modal state.
