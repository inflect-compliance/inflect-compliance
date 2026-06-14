# 2026-06-14 — action-label-vocabulary baseline drives to zero

**Branch:** `claude/cleanup-4-action-label-vocab`

Fourth wave of the CI cleanup. The `BASELINE_PLUS_LITERAL_SITES` ratchet
had 22 entries — sites carrying legacy `'+ <Word>'` literals where
CLAUDE.md's canonical pattern is `icon={<Plus />}` + bare noun. This
PR migrates every site.

## Migration pattern

Per CLAUDE.md's action-button vocabulary:

```jsx
// Before
<Button variant="primary">+ Risk</Button>

// After
<Button variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />}>
  Risk
</Button>
```

For ternary-with-state forms (`{busy ? 'Saving…' : '+ Version'}`):

```jsx
<Button
  icon={busy ? undefined : <Plus className="-ml-0.5 -mr-2.5" />}
  loading={busy}
>
  {busy ? 'Saving…' : 'Version'}
</Button>
```

## Sites migrated (22 → 0)

### Stale baseline entries (4) — already migrated upstream
The baseline carried entries for `audits/readiness:155`, `controls/[controlId]/tests/[planId]:300`, and three `vendors/[vendorId]` lines. These were stale — the `+ Word` literals had already been migrated to the `icon={<Plus />}` pattern (the literal cleanup of `controls/[controlId]/tests/[planId]` happened in PR #1066 round 2 when the hand-rolled link was replaced with `<BackAffordance />`). Just refreshed `audits/readiness` `<Link>` once more (text-only — `<Link>` isn't a `<Button>` so the icon slot doesn't apply).

### Migrated this PR (17 unique button sites + 1 EmptyState action)

| File | Site |
|---|---|
| `admin/api-keys/page.tsx` | "API Key" header button |
| `admin/integrations/page.tsx` | "Integration" header button |
| `admin/risk-matrix/RiskMatrixAdminClient.tsx` | "Band" header button |
| `admin/roles/page.tsx` | "Role" header button |
| `admin/scim/page.tsx` | "Token" header button |
| `admin/vendor-templates/[templateId]/VendorTemplateBuilderClient.tsx` | "Section" + "Question" submit buttons (ternary form) |
| `audits/cycles/page.tsx` | "Cycle" toggle (ternary) + submit + EmptyState `primaryAction.label` |
| `audits/cycles/[cycleId]/page.tsx` | "Pack" button (ternary) |
| `audits/readiness/page.tsx` | "Audit Cycle" Link |
| `policies/[policyId]/page.tsx` | "Version" button (raw `<button>` + Button submit, both ternary) |
| `tasks/[taskId]/page.tsx` | "Link" submit + "Comment" submit (both ternary) |
| `tests/runs/[runId]/page.tsx` | "Evidence" toggle (ternary) |
| `components/TestPlansPanel.tsx` | "Test Plan" toggle (ternary) |

### Two non-standard forms

- **`audits/cycles` EmptyState `primaryAction.label`** — `EmptyStateAction` does NOT expose an `icon` field. Per CLAUDE.md's empty-state register, the verbed form `'Add Audit Cycle'` is the canonical text-only fix (matches the "child-attachment register" convention).
- **`policies/[policyId]` raw `<button>` at line 454** — not a `<Button>` primitive (uses `buttonVariants()` className directly). Inlined `<Plus />` child element instead of `icon` prop, removed the `+ ` prefix from text.

## Ratchet movement

| Ratchet | Was | Now |
|---|---|---|
| `BASELINE_PLUS_LITERAL_SITES.size` | 22 | **0** |

The ratchet now enforces a **hard zero**. Any new `'+ <Word>'` literal in `src/app` or `src/components` fails CI without an explicit baseline re-add (a reviewer would block that).

## Test summary

- `npx jest tests/guards/rq4 tests/guards/page-header-discipline.test.ts tests/guards/detail-page-back-prop-ban.test.ts tests/guards/action-label-vocabulary.test.ts tests/guards/no-explicit-any-ratchet.test.ts tests/guardrails/no-explicit-any-ratchet.test.ts tests/guards/no-plus-prefix-labels.test.ts` — **66/66 across 13 suites**.
- `npx tsc --noEmit` — zero new errors across the 13 modified files.

## Cleanup wave progress

- ✅ PR A (#1067) — `as any` (4 → 0) **merged**
- ✅ PR B (#1068) — BackAffordance admin batch (46 → 29) **merged**
- ✅ PR C (#1069) — BackAffordance final batch (29 → 0) **merged**
- 🟢 **PR D (this)** — `action-label-vocabulary` (22 → 0)
- ⏳ PR E — Node base image bump (4 Trivy CVEs)
- ⏳ Deferred (real product work, not cleanup) — `epic55-native-select` primitive build, `epic52-datatable` migration
