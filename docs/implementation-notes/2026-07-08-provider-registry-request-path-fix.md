# 2026-07-08 — Provider registry empty in the request path + connected access-review UI wiring

**Commit:** `<pending>` fix: register providers in every consumer module graph; wire CONNECTED_APP review

## Symptoms (operator-reported)

1. Admin → Integrations "Add Integration → **Select provider**" dropdown is empty.
2. The "Available integrations" catalog shows nothing.
3. Access reviews only offer the local roster — no Okta / Google option.

## Root cause

The provider **registry is a module singleton** populated by the side-effecting
`integrations/bootstrap.ts`. PR #1525 registered bootstrap only at the two
process-startup hooks (`instrumentation.ts`, `scripts/worker.ts`) and REMOVED
the request-path import (it had broken a unit test).

That does not work: Next.js bundles `instrumentation.ts` and route handlers into
**different module instances**, so the `registry` the startup hook fills is a
different object than the one the route reads. Reproduced deterministically —
importing `listAvailableProviders()` the way the route does (no instrumentation)
returns `PROVIDER_COUNT=0`.

Both symptoms cascade from the empty registry:
- dropdown / catalog read `registry.listProviders()` → `[]`.
- `identity-sync` (worker) resolves no Okta/Google provider → never writes
  `ConnectedIdentityAccount` rows → a CONNECTED_APP review has "zero subjects".
  AND the create form never offered the CONNECTED_APP scope in the first place.

## Fix

1. **Register providers in every consumer's own module graph** — a side-effect
   `import '../integrations/bootstrap'` in `usecases/integrations.ts` (dropdown +
   admin ops) and the worker consumers `automation-runner`, `sync-pull`,
   `identity-sync`, `hris-sync`, `webhook-processor`. ESM dedupes, so it runs
   once; the registry is now populated wherever these load, independent of Next's
   bundling. Repro now returns all 10 provider ids.
   - Unit tests that mock the registry get `jest.mock('.../integrations/bootstrap', () => ({}))`
     so bootstrap's `registry.register(...)` doesn't run against the mock.
2. **Wire the CONNECTED_APP scope into the access-review create form** —
   `AccessReviewsClient` now offers a third scope (Okta / Google Workspace) that
   POSTs to the existing `/access-reviews/connected` endpoint + usecase (which
   were built but unreachable from the UI).

## Decisions

- **Consumer-graph import, not a startup hook.** The startup-hook approach is
  the fragile part; importing the side-effect module in the code path that reads
  the registry is the reliable pattern. The startup-hook imports stay (harmless,
  belt-and-suspenders).
- **Mock bootstrap in registry-mocking unit tests** rather than dropping the
  import — the import is load-bearing in production, so the test must accommodate
  it, not the reverse (the #1525 mistake).
