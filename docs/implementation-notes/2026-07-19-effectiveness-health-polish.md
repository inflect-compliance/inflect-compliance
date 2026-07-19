# 2026-07-19 — Effectiveness / health surface polish (PR-Z)

**Commit:** `<sha> chore(controls): surface the health-scan cap, explain measured-only health, leaderboard provenance, kill stale comments`

## Design

Five low-severity polish items on the now-mature effectiveness/health surface.

### 1 — Health-verdict scan: cap surfaced, not silently truncating
`getControlHealthVerdicts` loaded `take: 5000` controls and silently dropped
badges past that. The prompt offered two fixes — compute within the paginated
list read, or document + surface the cap.

**Chose: surface the cap.** Computing per-page is not viable *because of PR-Y*:
the health FILTER facet resolves `verdict → control-ids` across the whole
tenant, so a page-scoped verdict set could not answer "which controls are
AT_RISK" (the filter would only ever find matches on the page you were already
looking at). The scan therefore stays tenant-wide, but is now honest about its
bound: it reads `cap + 1` (sentinel), reports `truncated` / `scanned` / `cap` on
`ControlHealthSummary`, and the dashboard renders an explicit warning notice
when truncation occurred. `HEALTH_VERDICT_SCAN_CAP` is exported and documented
with the reason it exists.

### 2 — The measured-only health model, stated inline
Health uses only the MEASURED pass rate while ROI falls back to DECLARED
effectiveness — so a control with declared 95 and no tests reads UNKNOWN on
Health but 95% on ROI, which looks like a contradiction. Both surfaces that show
the verdict now carry an `InfoTooltip` saying health reflects measured test
operating-effectiveness only (declared informs valuation/ROI, not health): the
dashboard card heading and the list's Health column header.

### 3 — Effectiveness provenance in the leaderboard
`getBestValueControls` already computed the MEASURED/DECLARED source but
`BestValueRow` dropped it, so a leaderboard rank never disclosed whether it
rested on measured tests or a declared guess. `effectivenessSource` is now on
the row and rendered as the SAME `StatusBadge` provenance chip the single-control
`ControlRoiCard` shows (reusing the existing `roi.source.*` labels, so the
vocabulary matches).

### 4 — Stale comments + provisional types
- `ControlMappingsTab`: the comment claiming per-framework applicability is "not
  yet surfaced by the mappings GET" was false — verified end-to-end
  (`/controls/{id}/requirements` → `listControlMappings` →
  `ControlRepository.listControlRequirementLinks`, which projects
  `applicability` + `applicabilityJustification` unconditionally). Comment
  replaced with the truth; `MappingRow`'s provisional-optional `applicability?`
  / `applicabilityJustification?` became required (`| null`, where null means
  "inherit"). No call site needed a fix — every use is a read.
- `templates/page.tsx`: removed the comment claiming the standalone search input
  was dropped; it renders ~20 lines below.

### 5 — Test-plan route split: deferral CONFIRMED
The `/controls/{id}/tests/{planId}` vs `/tests/plans/{planId}` vs
`/tests/runs/{runId}` split stands. **Confirmed intentional** — and, unlike a
bare "we'll live with it", the mitigation was verified: the run page's
breadcrumb trail rebuilds the CONTROL-scoped plan href
(`/controls/${run.controlId}/tests/${run.testPlanId}`, conditional on the run
carrying that context), so plan → run never silently flips context. Rather than
restructure routes, that mitigation is now **locked by a guard**
(`tests/guards/test-plan-run-breadcrumb-bridge.test.ts`) so the claim can't rot
into a stale docstring — stripping the control crumb fails CI and forces a
conscious re-decision.

## Files

| File | Role |
| --- | --- |
| `usecases/control/health.ts` | `HEALTH_VERDICT_SCAN_CAP` + `truncated`/`scanned`/`cap` |
| `_components/ControlHealthSummary.tsx` | truncation notice + measured-only tooltip |
| `controls/ControlsClient.tsx` | measured-only tooltip on the Health column header |
| `usecases/control-roi.ts` | `effectivenessSource` on `BestValueRow` |
| `_components/BestValueControls.tsx` | provenance badge per ranked row |
| `[controlId]/_tabs/ControlMappingsTab.tsx` | stale comment + non-provisional `MappingRow` |
| `controls/templates/page.tsx` | stale search-removed comment |
| `tests/guards/test-plan-run-breadcrumb-bridge.test.ts` | locks the route-split mitigation |

## Decisions

- **Surface the cap rather than page-scope the verdicts.** PR-Y's health filter
  needs tenant-wide verdicts; page-scoping would silently break it. Honest
  truncation reporting is the correct trade-off, and the cap constant now
  carries the reason in its docstring.
- **Confirm the route split, but lock its mitigation.** The deferral is only
  defensible while the breadcrumb bridge exists — so the bridge is now a test,
  not a comment.
- **Left `FrameworkMappingDTOSchema` alone.** Only `MappingRow` (the tab-local
  view type) was tightened; the shared zod schema feeds other surfaces where
  tightening could break unrelated consumers.
