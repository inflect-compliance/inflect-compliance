# 2026-07-18 — SoA surface cleanup (PR-V)

**Commit:** `<sha> chore(reports): guard the standalone SoA surface for non-ISO, honor the selected framework, remove dead report API surface`

## Design

The reports-hub redesign (PR-H) and the export migration (PR-U) left the
standalone `/reports/soa` surface and a small cluster of pre-redesign
report plumbing behind. This is the long-tail cleanup.

### SoA surface — ISO-only + framework-honouring
- **`/reports/soa` and `/reports/soa/print`** now read `?framework` from the
  URL and thread it into `getSoA`, and **redirect non-ISO frameworks** to
  the readiness hub (`/reports`). The Statement of Applicability is an
  ISO-27001 Annex-A artifact; a non-ISO framework has no SoA, so the
  standalone surface is guarded against direct-URL access (the hub's SoA
  card is already ISO-gated). SoAClient keeps its existing non-ISO
  `InlineNotice` as a defensive fallback (two-layer, like the app's RLS +
  app-filter isolation).
- **"Open SoA"** (`ReportsClient`) forwards `?framework=<selectedKey>`, so
  with two ISO frameworks installed the SoA opens the one the user selected
  on the hub — matching the CSV export, which already scoped by framework.

### Orphaned print view — resolved by keeping + wiring
The print route + `SoAPrintView` were built but never linked. **Decision:
keep and wire**, not delete — the print view has nav carve-outs
(`canonical-parents`, `page-segregation` ×3) and four guard-test exemptions,
so deleting it would ripple into all of those, whereas a "Print / Save as
PDF" affordance in the SoA filter row is genuinely useful and browser-print
of a clean layout is distinct from the server-rendered PDF exports. The
Print link forwards `?framework` and the print page applies the same
ISO-only redirect guard.

### Dead API surface removed
- **`getReports`** (`report.ts`) computed an ISO-shaped `soa` array that its
  only live caller (the Risk Register PDF) discarded. Dropped the `soa`
  computation + the now-unused `ReportRepository.getSOAData`; `getReports`
  returns `{ riskRegister }` only.
- **Two orphaned GET routes** deleted — `/api/t/[tenantSlug]/reports` and the
  non-tenant `/api/reports`. Both returned the full `{ soa, riskRegister }`
  and had no frontend caller, no openapi entry, no test coupling.

### Translation + comment hygiene
- Pruned **14 dead pre-redesign flat keys** from the `reports` namespace
  (`subtitle`, `loading`, `control`, `name`, `applicable`, `status`,
  `evidence`, `overdue`, `risk`, `threat`, `score`, `treatment`, `owner`,
  `controls`) in `en.json` + `bg.json`. Detected by scoping usage to the four
  files that bind `useTranslations('reports')` and subtracting the keys they
  actually call; each was double-checked for zero qualified `reports.<key>`
  references before deletion.
- Fixed the stale SoA CSV route header comment — it documented a single
  fixed column set (the ISO shape) but the route emits two shapes; the
  comment now describes both the ISO and non-ISO column lists.

### Polish
- The readiness KPI tile renders `${readinessScore}/100` instead of a bare
  integer (matches the "Readiness /100" metric in the Audit Readiness PDF).
- The SoAClient rollup `StatusBadge` map gained `PLANNED` (neutral) and
  `IMPLEMENTING` (info) so every `ControlStatus` lifecycle value is
  localised instead of falling through to the raw enum string.

## Files

| File | Role |
| --- | --- |
| `reports/soa/page.tsx` | Read `?framework`, thread to getSoA, redirect non-ISO |
| `reports/soa/print/page.tsx` | Same framework-thread + non-ISO redirect for the print view |
| `reports/ReportsClient.tsx` | Open-SoA link forwards `?framework`; readinessScore → `/100` |
| `reports/soa/SoAClient.tsx` | Print affordance (forwards `?framework`); status map + PLANNED/IMPLEMENTING |
| `usecases/report.ts` | Drop SoA computation; return `{ riskRegister }` |
| `repositories/ReportRepository.ts` | Delete unused `getSOAData` |
| `api/t/[tenantSlug]/reports/route.ts`, `api/reports/route.ts` | **Deleted** — orphaned GET routes |
| `api/.../reports/soa/export.csv/route.ts` | Fix stale single-shape column comment |
| `messages/en.json`, `messages/bg.json` | Prune 14 dead flat keys; add `soaView.print` |

## Decisions

- **Redirect, don't column-suppress, for non-ISO.** Guarding at the page
  level (server redirect) is simpler and more robust than threading an
  `isIsoFamily` conditional through every SoA column + badge; the hub card is
  already ISO-gated so the redirect only catches direct-URL access.
- **Keep the print view.** Deleting it would touch 6+ nav/guard files for a
  built, useful affordance; wiring a Print link costs one link + the same
  guard the interactive page already got.
- **Keep the `getReports` name.** It still backs the Risk Register PDF;
  renaming would ripple into the PDF + its test for no functional gain. The
  doc comment records why the `soa` half is gone.
- **Programmatic i18n prune.** Both message files round-trip exactly through
  `JSON.stringify(obj, null, 2)`, so deleting keys on the parsed object
  produced a minimal, non-reordering diff instead of hand-editing 28 lines.
