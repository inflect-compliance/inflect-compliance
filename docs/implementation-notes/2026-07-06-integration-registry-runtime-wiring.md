# 2026-07-06 — Integration provider registry: runtime wiring

**Commit:** `<pending>` — ignite the automated-check engine

## Design

The integration provider `registry` (`src/app-layer/integrations/registry.ts`)
is a module-level singleton that starts empty and is populated only by the
side-effecting import of `@/app-layer/integrations/bootstrap` (which calls
`registry.register(new GitHubProvider())` + `integrationRegistry.register({…})`).

That bootstrap module was imported **only from tests** — never from any
runtime entry point. So in the running app the registry was empty, which
silently disabled two shipped features:

- **`automation-runner`** (registered in `executor-registry.ts`, scheduled
  every 15 min in `schedules.ts`) resolves each due control's `automationKey`
  via `registry.resolveByAutomationKey(...)`. With an empty registry every
  control `canHandle(...)` check is false, so the runner scans and skips —
  no automated checks ever execute.
- **Admin integrations** (`/api/t/[slug]/admin/integrations`) builds its
  provider list from `registry.listProviders()` and validates every
  connection against `registry.getProvider(...)`. Empty registry ⇒ the UI
  offers no providers and rejects connection creation.

The fix is a one-line side-effecting import at each runtime entry point:

- `src/instrumentation.ts::register()` (Next.js web/server startup)
- `scripts/worker.ts` bootstrap IIFE (BullMQ worker process)

Both already `await import(...)` their startup dependencies; the bootstrap
import slots in beside them. Module caching makes the registrations
idempotent, so importing once per process is sufficient and safe under HMR.

## Files

| File | Role |
|---|---|
| `src/instrumentation.ts` | Import the integration bootstrap on web startup |
| `scripts/worker.ts` | Import the integration bootstrap on worker startup |
| `tests/guardrails/integration-bootstrap-runtime-wiring.test.ts` | Locks both runtime imports in place + asserts importing the bootstrap populates the provider + bundle registries — new |

## Decisions

- **Fix at the entry points, not by making the registry self-populating.**
  Keeping registration in the explicit `bootstrap` module preserves the
  existing test seam (tests import bootstrap directly and `registry._clear()`
  between cases) and the "one place registers providers" contract. The only
  bug was that nothing imported it at runtime.
- **Structural guardrail over a pure behavioural one.** The behavioural test
  (import bootstrap → registry non-empty) can pass even if a refactor drops
  the runtime import, because the test itself imports bootstrap. So the
  guardrail also asserts, by source scan, that `instrumentation.ts` and
  `worker.ts` contain the import — the regression that actually matters.
- **This is the foundation the rest of the Vanta-equalization plan stands
  on.** Every later PR that adds a provider (identity, cloud posture, HRIS,
  device, ticketing) or an automated check depends on the registry being
  live in the running process. This PR makes the existing GitHub check path
  actually execute end-to-end for the first time in production.

## Context

Discovered while scoping "PR-1 — ignite the automated-test engine" against
the live branch. An earlier draft targeted an Epic G-2 control-test-runner
handler seam that exists on an older divergent line but not on this branch;
the true, minimal fix on this branch is the runtime registry wiring above.
The already-present `automation-runner` (control-level checks keyed off
`Control.automationKey` + `evidenceSource='INTEGRATION'`) needs no changes —
only a populated registry.

## Follow-ups

- Expand the provider catalogue (identity providers, cloud posture) so the
  now-live engine has more than GitHub to run — subsequent PRs.
- A first-class "Tests"/automated-checks surface exposing per-control run
  status and history.
