# 2026-06-21 — Stale root-artefact cleanup + ratchet

**Commit:** `<sha> chore(repo): delete stale root artefacts + ratchet`

Six transient outputs had been accidentally committed to the repo root. All
six are deleted, `.gitignore`d, and now blocked from returning by a structural
ratchet.

## Files removed (one-line forensic note each)

| File | Origin |
|------|--------|
| `nul` | A Windows `> nul` shell-redirect run on a non-Windows assumption — `nul` isn't a device on Linux/macOS, so the redirect created a real file that got staged. Never a legitimate artefact. |
| `next_error.html` | Next.js dev error-overlay page saved to disk while debugging a runtime error. |
| `next_error2.html` | Second saved Next.js error-overlay page from the same debugging session. |
| `playwright-results.json` | Ad-hoc Playwright JSON-reporter dump (`--reporter=json` redirected to a file) captured while debugging an E2E failure. |
| `playwright-results2.json` | Second Playwright JSON dump from the same investigation. |
| `playwright-results3.json` | Third Playwright JSON dump from the same investigation. |

## Changes

- **`git rm`** of all six.
- **`.gitignore`** — added `playwright-results*.json`, `next_error*.html`, and
  `nul` to the existing test-artefacts block (beside `playwright-report/`),
  each with a one-line reason.
- **`tests/guards/no-stale-root-artefacts.test.ts`** — a tracked-files
  invariant mirroring the GAP-16 env-file filename guard in
  `tests/guardrails/no-secrets.test.ts`: enumerates `git ls-files` and fails
  if any tracked basename matches `nul`, `next_error*.html`, or
  `playwright-results*.json`. `.gitignore` alone wouldn't catch a `git add -f`
  or a regressed rule; the ratchet does.

## Decisions

- **Basename matching, not full-path.** These artefacts only ever appear at the
  root, but matching the basename keeps the guard robust if a future debug run
  drops one in a subdirectory.
- **A "guards the guard" assertion** verifies the matchers still catch the six
  original names and don't flag legitimate files (`index.html`, `results.json`,
  `annul.ts`) — so a refactor of the matcher list can't silently neuter it.
