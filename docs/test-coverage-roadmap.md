# Test coverage roadmap

> Last regenerated: 2026-06-06 from a local parallel run (`SKIP_ENV_VALIDATION=1 npx jest --coverage --selectProjects node`). The numbers below are slightly lower than CI's because the parallel run skips ~340 DB-backed integration tests that need the seeded fixture state. Relative rank across domains is still informative — that's what drives sequencing.
>
> Local global from this run: stmts **71.46 %** · branches **61.17 %** · functions **61.74 %** · lines **72.88 %**.
> CI global on `main` (commit `3231937a`): stmts **77.94 %** · branches **66.27 %** · functions **64.70 %** · lines **79.27 %**.
> Enforced floors live in [`jest.thresholds.json`](../jest.thresholds.json).

---

## Context

The global coverage floors (`jest.thresholds.json`) sit well below today's actuals on every metric — there's ~9 points of headroom across the board. **But the per-directory floor on `src/app-layer/usecases/` is `46 % statements / 30 % functions`** — far below the global. That delta is the load-bearing signal: usecases are the codebase's coverage debt centre, and usecases are organised by domain. The roadmap below targets those domains directly.

`src/components/**` (UI primitives + page-level React) is **deliberately out of scope** for the gate today — covered by the jsdom project's own contract (Epic 51–60 ratchets check structural adoption, not line coverage). This roadmap does not propose adding it.

---

## Targets by tier

Every domain gets one of three tiers. The tier governs the floor we ratchet up to, not what we promise to hit instantly.

| Tier | Statement floor | Branch floor | Function floor | Rationale |
| --- | ---: | ---: | ---: | --- |
| **Core** | 80 % | 70 % | 70 % | Domains where a silent regression is a customer-facing bug or compliance gap. Mutations on these tables show up on audit packs. |
| **Supporting** | 70 % | 60 % | 60 % | Domains that surround Core — heavy churn but bug-tolerable. |
| **Edge** | 60 % | 50 % | 50 % | Stable utility/infrastructure, slow change, low blast radius. Floor mainly so refactors can't silently delete coverage. |

The floors are deliberately **looser than the current actuals on well-tested domains** — the ratchet locks the *floor*, not today's number, so refactors that delete dead branches don't suddenly fail CI on what was a passing run.

---

## Tier assignments (proposed)

| Tier | Domains |
| --- | --- |
| **Core** | Compliance core (controls, policies, frameworks) · Risk · Audit + audit trail · Auth + security + sessions · Evidence + files |
| **Supporting** | Work items (tasks, findings, issues) · Vendor · Tenant lifecycle + org management · Automation + integrations + notifications · Reports + dashboards + portfolio |
| **Edge** | Asset · Test plans + runs · Cross-cutting lifecycle (soft-delete / editable) · `lib/` infrastructure |

Notes on the assignments:

- **Compliance core** is unambiguously Core — it's the product. Controls + policies + frameworks define every customer's compliance state; a regression here breaks audits.
- **Auth + security** is Core because every Epic A/B/C/D/E/F mitigation in `CLAUDE.md` lives there. Coverage debt becomes a security incident in a way it doesn't elsewhere.
- **Audit trail** is Core because the hash-chained `AuditLog` is the legal record. A silently-broken `logEvent` is a sev-1.
- **Risk + Evidence** are Core: they're the inputs and outputs of every audit cycle.
- **Work items** is Supporting (not Core) because tasks are operational — a bug surfaces fast, doesn't corrupt durable state.
- **Vendor** and **Automation** are Supporting because they're integration surfaces — a lot of code is glue to external systems where contract tests beat unit coverage.
- **`lib/` infrastructure** is Edge because it's already well-covered (the existing 54 % floor is closer to its actual). Most regression risk is caught by guardrails, not unit coverage.

---

## Per-domain baseline + targets

> Filled in from `coverage/coverage-summary.json` after `npm run test:coverage`.

<!-- COVERAGE_TABLE_START -->

Sorted by statement coverage ascending (worst-covered first).

| Domain | Tier | Files | Stmts % | Branch % | Func % | Stmt floor | Gap to floor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vendor | Supporting | 4 | 29.9 | 18.5 | 17.0 | 70 | **+40.1** |
| Asset | Edge | 1 | 37.1 | 56.2 | 28.6 | 60 | +22.9 |
| Work items (tasks / findings / issues) | Supporting | 4 | 41.6 | 39.8 | 20.7 | 70 | **+28.4** |
| Evidence + files | **Core** | 8 | 45.1 | 39.6 | 23.8 | 80 | **+34.9** |
| Compliance core (controls / policies / frameworks) | **Core** | 27 | 47.3 | 43.6 | 32.9 | 80 | **+32.7** |
| Audit + audit trail | **Core** | 14 | 56.6 | 37.5 | 44.0 | 80 | **+23.4** |
| Cross-cutting lifecycle (soft-delete / editable) | Edge | 3 | 58.7 | 51.2 | 38.5 | 60 | +1.3 |
| Risk | **Core** | 5 | 59.8 | 55.0 | 32.4 | 80 | **+20.2** |
| Tenant lifecycle + org management | Supporting | 11 | 61.3 | 55.2 | 53.4 | 70 | +8.7 |
| Automation + integrations + notifications | Supporting | 68 | 76.7 | 68.0 | 76.8 | 70 | already passes |
| API route handlers (`src/app/api/**`) | n/a (thin) | 53 | 77.9 | 62.5 | 78.2 | — | — |
| Auth + security + sessions | **Core** | 22 | 78.7 | 62.3 | 74.6 | 80 | +1.3 |
| `lib/` infrastructure | Edge | 120 | 84.6 | 71.7 | 78.4 | 60 | already passes |
| Reports + dashboards + portfolio | Supporting | 7 | 84.8 | 74.4 | 82.1 | 70 | already passes |
| App layer — uncategorized | n/a (thin) | 32 | 87.7 | 70.7 | 82.8 | — | — |

**The headline finding:** four Core domains carry >20-point gaps to their tier floor — **Evidence + files (+34.9)**, **Compliance core (+32.7)**, **Audit (+23.4)**, **Risk (+20.2)**. These four are the entire substance of Q1+Q2. Auth + security is functionally already at-floor (+1.3 is well within run-to-run noise). All other under-floor domains are Supporting or Edge tier — they queue behind the Core work.

<!-- COVERAGE_TABLE_END -->

The **Gap** column drives sequencing: it's how many statement-percentage points each domain must move to hit its tier floor. Negative gap = already above the floor; positive = work to do.

---

## Sequencing — grounded in the gaps

Three quarters of focused work. Each quarter ends with the floors bumped in `jest.thresholds.json` so the ratchet permanently locks the gain. The order below was set by the gap column above, not by my prior speculation.

### Q1 — close the two biggest Core gaps

**Targets:** Evidence + files (+34.9) and Compliance core (+32.7). Both Core, both >30 points under floor.

1. **Evidence + files.** Add unit tests for:
   - `usecases/evidence.ts` — every exported function. Mock `EvidenceRepository` + `FileRepository`. The link/unlink flows, retention enforcement, and bundle composition are the highest-impact targets — those are how customers prove compliance.
   - `usecases/evidence-retention.ts` — date arithmetic + decision logic. Pure functions → highest test value per line.
   - `usecases/evidence-maintenance.ts` — periodic job; mock the clock.
   - `usecases/data-portability.ts` — export pipelines. Tests should pin the export schema.
   - `usecases/file.ts` — uploads, AV-scan handoff. AV scan path already has `tests/unit/av-scan.test.ts` — extend it.
   - **Target shift:** 45 % → 80 % statements. ~280 new covered statements.
2. **Compliance core (controls / policies / frameworks).** 27 files at 47 %. Highest leverage:
   - `usecases/control/queries.ts`, `mutations.ts`, `evidence.ts`, `tasks.ts`, `page-data.ts` — already have some coverage. Fill in branches: `assertCanX` denied paths, the `OR: [{tenantId}, {tenantId: null}]` template-controls path, `notFound` throws.
   - `usecases/policy.ts` — version creation, approval flow, sanitisation seam. Mock `sanitizeRichTextHtml`.
   - `usecases/framework/install.ts` — the heaviest single file (catalog → DB seed). Snapshot the install plan, then assert idempotency.
   - `usecases/mapping.ts`, `traceability.ts` — cross-framework projection. Snapshot the projection shape.
   - **Target shift:** 47 % → 80 %. ~565 new covered statements. Biggest single domain volume in the roadmap.
3. Bump per-path floors in `jest.thresholds.json`:
   ```json
   "./src/app-layer/usecases/evidence": { "statements": 80, "branches": 70, "functions": 70, "lines": 80 },
   "./src/app-layer/usecases/control":  { "statements": 80, "branches": 70, "functions": 70, "lines": 80 },
   "./src/app-layer/usecases/policy":   { "statements": 80, "branches": 70, "functions": 70, "lines": 80 },
   "./src/app-layer/usecases/framework":{ "statements": 80, "branches": 70, "functions": 70, "lines": 80 }
   ```

End of Q1: two Core domains at floor; global statement coverage moves ~4–5 points; floors lock the gains.

### Q2 — finish the Core tier + close the worst Supporting gap

**Targets:** Audit (+23.4), Risk (+20.2), and Vendor (+40.1, Supporting).

1. **Audit + audit trail.** 14 files at 57 %. The hash-chained `appendAuditEntry`, `verifyAuditChain`, and `audit-stream` modules already carry substantial unit tests; the gap is in `audit-readiness/*` and `audit-hardening.ts` — both are user-facing query layers, easy to mock at the repo seam.
2. **Risk.** 5 files at 60 %. `usecases/risk.ts` covers create/update/score paths — extend tests for treatment plan transitions and inherent/residual scoring matrix. `risk-matrix-config.ts` is brand new (Epic 44, see #101 PR description) — pin its decision table now while it's small.
3. **Vendor.** 4 files at 30 %. The lowest-covered domain on the board, but Supporting tier — gap is largest, blast radius smallest. Vendor assessment flow + risk inheritance are the load-bearing paths.
4. Floor bumps:
   ```json
   "./src/app-layer/usecases/audit-readiness": { "statements": 80, ... },
   "./src/app-layer/usecases/risk":             { "statements": 80, ... },
   "./src/app-layer/usecases/vendor":           { "statements": 70, ... }
   ```

End of Q2: every Core domain at-floor; Vendor pulled from worst-on-board to at-Supporting-floor.

### Q3 — Work items, Tenant lifecycle, Edge tier, global floor bump

**Targets:** Work items (+28.4), Tenant lifecycle (+8.7), Asset (+22.9), Cross-cutting lifecycle (+1.3), `lib/` (already passes — only ratchet).

1. **Work items.** `usecases/task.ts`, `finding.ts`, `issue.ts`, `due-planning.ts`. Mock the `WorkItemRepository`. The `task-relevance.test.ts` already exists — extend the unit-test sibling pattern across the other three.
2. **Tenant lifecycle.** 11 files at 61 %. Mostly thin orchestration over `OnboardingRepository`. Already close to floor; surgical fill-in.
3. **Asset, Cross-cutting lifecycle.** Edge — small. Surgical.
4. **`lib/`** — already at 85 %; no work, just lock the floor at 80 %.
5. **Global floor bump in `jest.thresholds.json`** — from `statements: 69 → 75`, `branches: 56 → 62`, `functions: 54 → 60`, `lines: 70 → 76`. This is set at the *lowest currently-passing actual*, not at the target, so the global gate keeps providing real protection without being noisy.

End of Q3: per-domain floors enforced for every Core and Supporting domain; global floor +6 points across the board.

---

## Mechanism — what locks each gain

Two mechanisms work together. Neither is new infra — the codebase already has both; this roadmap just uses them more deliberately:

1. **`--coverageThreshold` floors via `jest.thresholds.json`**, enforced by the `Gate: test coverage thresholds` CI step (the Coverage job in `.github/workflows/`). The in-config `coverageThreshold` is NOT enforced under Jest 29.7 multi-project mode — known issue documented in `docs/implementation-notes/2026-04-27-gap-15-coverage-enforcement.md`. The CLI flag IS enforced. Every per-path entry in `jest.thresholds.json` corresponds to one or more domains. When a quarter ends and a floor bumps, CI fails on any future PR that walks coverage back below the new floor.
2. **Structural ratchets** (the `tests/guardrails/` pattern — Epic 51-60 already uses dozens of these). A coverage ratchet has a sibling structural one: "every usecase in `src/app-layer/usecases/<domain>/` MUST have a sibling `.test.ts` in `tests/unit/` or `tests/integration/`." That catches the case where a *new* untested usecase appears (raw coverage % could stay flat if the new file is small).

**Proposed new guardrail** (would land in Q1): `tests/guardrails/usecase-test-coverage.test.ts` — walks `src/app-layer/usecases/**/*.ts`, asserts every non-`index.ts` non-`*.types.ts` file is *imported* (via `from '@/app-layer/usecases/<name>'` or relative-path equivalent) by at least one file under `tests/unit/` or `tests/integration/`. Fails CI on the first untested addition. Per-domain `EXEMPTIONS` allow Edge-tier files to slip; the exemption list is itself ratchet-locked (can only shrink). This mirrors exactly the `tests/guardrails/controls-tasks-list-hydration.test.ts` pattern landed in PR #101 and the `tests/guardrails/sanitize-rich-text-coverage.test.ts` ratchet from Epic D.

---

## What this roadmap is NOT

- **Not a rewrite plan.** No usecase is being refactored to make it testable — existing seams (mock the repo, run the usecase) are sufficient. If a usecase is genuinely untestable today, that's the bug.
- **Not a per-file coverage push.** Lines and statements are the wrong granularity to ratchet at file level — too noisy, too easy to game with `/* istanbul ignore next */`. Per-domain aggregates are the right grain.
- **Not a substitute for integration tests.** Several domains (Compliance core, Audit, Auth) already get DB-backed integration tests under `tests/integration/`. The roadmap **adds** unit coverage; the integration suite stays.
- **Not a deadline.** Quarters are sequencing buckets, not commitments. Pace is whatever each domain's owner can sustain.

---

## How to regenerate this table

```bash
npm run test:coverage         # ~25 min, produces coverage/coverage-summary.json
python3 scripts/coverage-by-domain.py > /tmp/cov.md
# then replace the table block between the COVERAGE_TABLE markers in this file
```
