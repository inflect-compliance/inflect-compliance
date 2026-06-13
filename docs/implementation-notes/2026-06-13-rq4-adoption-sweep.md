# 2026-06-13 — RQ4 adoption sweep (PRs 5–8)

**Branch:** `claude/implement-login-O64VA`

Mechanical adoption sweep across every tenant-scoped subpage that had
a hand-rolled "← Back …" link today. Each callsite replaces the
hand-rolled `<Link>` with `<BackAffordance />` so the smart-back
primitive owns the affordance everywhere.

Pages migrated in this batch:

| Group | Pages |
|---|---|
| Detail entities | `risks/[riskId]`, `assets/[id]`, `vendors/[vendorId]`, `tasks/[taskId]`, `policies/[policyId]` |
| Audit nested | `audits/cycles/[cycleId]`, `audits/cycles/[cycleId]/readiness`, `audits/packs/[packId]` |
| Vendor nested | `vendors/[vendorId]/assessment/[assessmentId]`, `vendors/new`, `vendors/dashboard` |
| Tasks special | `tasks/new`, `tasks/dashboard` |
| Tests | `tests/runs/[runId]`, `tests/due`, `tests/dashboard` |
| Policies / Controls | `policies/templates`, `controls/templates`, `controls/dashboard`, `controls/[controlId]/tests/[planId]` |
| Risks | `risks/ai`, `risks/import` |
| Frameworks | `frameworks/[frameworkKey]`, `.../install`, `.../templates`, `.../diff` |

Each page now:

  - imports `BackAffordance` from `@/components/nav/BackAffordance`
  - removes the hand-rolled `<Link href="…">← {label}</Link>`
  - renders `<BackAffordance />` above its title

Behavioural change visible to users:

  - Label upgrades from `← Section` to `← Back to <Destination>` —
    destination resolves to the in-tab referrer when available,
    canonical parent otherwise (e.g. opening `/risks/abc` in a fresh
    tab still shows `Back to Risks`).
  - The arrow is now the `ArrowLeft` SVG icon (`currentColor`,
    matches the rest of the nucleo set), not the Unicode `←` glyph.
  - Hover transition runs only under `motion-safe:` (OB-G).
  - Hidden from print (OB-I).
  - `aria-label="Back to {Destination}"`; icon `aria-hidden` (OB-C).

## Decisions

- **No `back={{ href, label }}` static-link migrations needed yet.**
  All migrated callsites were hand-rolled `<Link>` JSX, not the
  `EntityDetailLayout.back` prop. The only existing `back` prop
  call (controls detail) already moved to `{ smart: true }` in the
  foundations commit.
- **Some pages had the back link mixed into a row of secondary
  actions** (e.g. tests/due had `← Tests | Dashboard | Run`). The
  affordance is moved OUT of the action row to its own line above
  the title — the visual rhythm matches every other migrated page.
- **`Link` imports kept in place** where they're still used for
  non-back navigation. Pages where `Link` becomes unused after the
  back-link removal kept the import — the TS config doesn't enforce
  `noUnusedLocals` on this branch, and removing them would have
  required per-file investigation for tree-shake safety.

## Remaining work (next batch)

The 25 subpages in `SUBPAGES` that DIDN'T have a back affordance today
(admin/*, audits/auditor, audits/cycles, audits/readiness, controls/new,
issues/*, onboarding, policies/new, reports/soa, reports/soa/print,
risks/dashboard, risks/new, security/mfa, auth/mfa) need the
affordance ADDED. That's the RQ4-9 + remainder of RQ4-7/8 work.

RQ4-10's cohort-sweep ratchet — which enforces positive coverage of
every SUBPAGE — lands once the remaining 25 are migrated.
