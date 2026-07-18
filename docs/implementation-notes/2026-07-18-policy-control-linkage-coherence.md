# 2026-07-18 — Policy ↔ control linkage & coherence

**Commit:** `<sha>` fix(policy): bidirectional control↔policy, linkage-based NIS2 readiness, unified template flow

## Design

Four coherence gaps around the policy/control seam, closed together.

1. **Bidirectional control ↔ policy.** The policy detail already showed its
   linked Controls (`PolicyTraceabilityPanel`), but the reverse was invisible:
   `ControlRepository.getById`/`getHeaderById` deliberately omitted
   `policyLinks`, and the control detail had no Policies surface. Both repo
   reads now load `policyLinks` (with the linked policy's `id/slug/title/status`),
   and the control detail Overview renders a read-only Policies section
   (`#control-policies-section`) — title link + status badge, empty state
   otherwise. Link/unlink stays owned by the policy side; the control side is
   a read-only mirror. The control DTO already declared `policyLinks`, so the
   change is contract-neutral.

2. **NIS2 policy readiness is now linkage-based.** `computeNIS2Readiness`
   scored the policy dimension by matching six hard-coded keyword areas
   against policy *titles* (`NIS2_KEY_POLICIES`) — fragile and gameable. It
   now scores the fraction of in-scope NIS2 controls that carry at least one
   `PolicyControlLink`, reusing the cycle's control set and mirroring the
   evidence-completeness shape (`withPolicy/total`). The keyword table is
   deleted; `MISSING_POLICY` gaps now point at specific unlinked controls.

3. **Unified template-creation flow.** The `/policies/templates` page was
   orphaned (nothing linked to it) yet held a capability the canonical
   `NewPolicyModal` lacked: the post-create control-suggestion confirm step.
   That step is now wired into the modal (opens `TemplateControlSuggestModal`
   when the create response carries `suggestedControlLinks.totalSuggested > 0`),
   and the orphaned page is a thin server redirect to the modal flow. One
   reachable path, no lost capability.

4. **Cleanups.** `markPolicyReviewed` no longer clears an explicitly-set
   `nextReviewAt` when a policy has no review cadence (a manual review date
   must survive "mark reviewed"). The stale `PolicyTraceabilityPanel`
   docstring ("no add/unlink affordance") is corrected to describe its
   editable mode.

## Files

| File | Role |
|------|------|
| `src/app-layer/repositories/ControlRepository.ts` | load `policyLinks` on `getById` + `getHeaderById` |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` | read-only Policies section on Overview |
| `src/app-layer/usecases/audit-readiness-scoring.ts` | NIS2 policy score → control-linkage; drop `NIS2_KEY_POLICIES` |
| `src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/readiness/page.tsx` | `withPolicy/total` detail |
| `src/app-layer/usecases/policy.ts` | `markPolicyReviewed` preserves explicit `nextReviewAt` |
| `src/components/PolicyTraceabilityPanel.tsx` | corrected docstring |
| `src/app/.../policies/NewPolicyModal.tsx` | wire post-create control-suggestion step |
| `src/app/.../policies/_form/useNewPolicyForm.ts` | widen `onSuccess` param type |
| `src/app/.../policies/templates/page.tsx` | orphaned page → redirect to canonical modal |

## Decisions

- **Control side is read-only.** Bidirectional visibility without a second
  mutation surface — link/unlink lives on the policy detail; duplicating it on
  the control would split ownership. `policyLinks` is small (a control links to
  a handful of policies), so loading it on the header read is cheap.
- **NIS2 score semantics changed intentionally.** Fraction-of-controls-with-a-
  linked-policy is stricter than the old keyword check but reflects real
  governance (an in-scope control should have documented policy backing). The
  breakdown reshaped `found/expected` → `withPolicy/total`; the readiness
  result is not in the OpenAPI snapshot, so no contract drift.
- **Redirect, don't delete.** The orphaned templates page becomes a redirect
  (bookmarks/breadcrumbs still resolve) rather than a 404;
  `TemplateControlSuggestModal` is retained — now consumed by the modal.
