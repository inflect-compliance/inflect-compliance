# 2026-06-13 — RQ3-OB-F — Unified first-run empty state

**Commit:** `pending` (branch `claude/rq3-ob-f-first-run`)

## Design

Every analytical view on a tenant with zero risks used to render a
different shape:

| Surface | Pre-OB-F |
| --- | --- |
| Risks list (`RisksClient`) | `<EmptyState>` with "Create risk" + onClick (modal) |
| Dashboard status-breakdown | Plain `<p>{t('noRisksYet')}</p>` |
| Board hygiene card | Plain `<p>No risks on the register yet.</p>` |
| Risk matrix (heatmap view) | Empty grid, no message |

Different copy, different CTA targets, sometimes no CTA at all. The
new operator landing on the dashboard first saw "no risks yet" with
nowhere to go; the one landing on the board saw a third variant.

This PR introduces one shared primitive — `<RiskFirstRunEmpty>` —
that wraps `<EmptyState>` with unified copy, a tenant-scoped CTA
deep-linking to `/risks?create=1` (which `RisksClient` already
auto-opens via its `?create=1` reader), and an `onCreateClick`
escape hatch for the risks-list page (which mounts the modal
locally and skips the navigation hop).

## The escape hatch

The risks list already has `<NewRiskModal>` mounted; opening it via
href would mean a navigation hop that does nothing visible. The
primitive accepts an optional `onCreateClick` callback that, when
supplied, swaps the CTA from an `<a href>` to a `<button onClick>`.
Every other consumer omits the prop and gets the deep-link form.

```tsx
// In RisksClient (modal already mounted on this page):
<RiskFirstRunEmpty size="sm" onCreateClick={() => setIsCreateOpen(true)} />

// On the dashboard / board (no modal here):
<RiskFirstRunEmpty size="sm" />   // → /t/<slug>/risks?create=1
```

## Files

| File | Role |
| --- | --- |
| `src/components/risks/RiskFirstRunEmpty.tsx` | NEW — unified primitive |
| `src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx` | List-empty branch uses primitive (onClick form) |
| `src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx` | StatusBreakdown emptyState slot uses primitive |
| `src/app/t/[tenantSlug]/(app)/risks/board/page.tsx` | Hygiene-empty branch uses primitive |
| `tests/rendered/risk-first-run-empty.test.tsx` | 5 cases on the primitive's contract |
| `tests/guards/rq3-ob-f-first-run.test.ts` | 7 structural ratchets (primitive shape + per-surface adoption) |

## Decisions

- **One primitive, three surfaces.** The matrix's empty-grid case
  stays as-is — when the user has chosen the heatmap view, the empty
  grid IS the structural cue (this is the matrix, it'll fill once
  you create risks). The list-view canonical empty state covers the
  "I don't know what this product does" case; the matrix doesn't
  need to repeat it.
- **`/risks?create=1` deep-link via `useTenantHref`.** The destination
  page already strips the param after opening the modal (existing
  RQ-era code), so back/forward doesn't re-trigger. Tenant-scoped
  href survives a slug rename without per-call-site fix-ups.
- **The "no quantified risks" state stays separate.** That's a
  different fact pattern ("you have risks, you just haven't
  quantified them") with a different CTA target ("Open a risk and
  fill the FAIR inputs"). Unifying both into one primitive would
  paper over the distinction; the brief is "first-run", not "all
  empty states".
- **`<div data-testid="board-hygiene-empty">` wrapper.** The
  existing testid was on a `<p>`; the primitive owns its own
  testid (`risk-first-run-empty`). A thin wrapper div keeps the
  board's existing testid so the rendered tests for the board
  page don't need an in-PR update.
