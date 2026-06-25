# 2026-06-25 — CONTRIBUTING.md (developer onboarding guide)

**Commit:** `docs: add CONTRIBUTING.md (developer onboarding guide)`

## Design

Ship a single `CONTRIBUTING.md` (~450 lines) at the canonical
GitHub-discoverable location, as the bridge between `README.md` (boot the app)
and `CLAUDE.md` (the full architecture spec). Goal: a contributor lands a first
PR within a day. It deliberately does **not** duplicate `CLAUDE.md` — it points
at it.

## Files

| File | Role |
|------|------|
| `CONTRIBUTING.md` | **new** — the 9-section onboarding guide |
| `README.md` | top-of-file pointer to CONTRIBUTING; fixed stale "Node 18+" → Node 24 |
| `CLAUDE.md` | top pointer: "Human contributors start at CONTRIBUTING.md; this is the LLM-assistant spec" |
| `docs/{coverage-policy,dependency-policy,auth,billing,incident-response}.md`, `docs/observability/01-deployment-topology.md` | back-link to CONTRIBUTING ("New to the codebase?") |
| `tests/guardrails/contributing-doc-coverage.test.ts` | **new** — structural ratchet |

## Decisions

- **One file, not fragmented.** The brief offered `CONTRIBUTING.md` +
  `docs/onboarding.md` + `docs/getting-started.md` as separate possibilities.
  Chose ONE canonical file: a new contributor should not have to discover which
  of three onboarding docs is current. `CONTRIBUTING.md` is the GitHub-blessed
  location (linked from the PR/issue UI), so it's where people look first. The
  cost — a longer single file — is paid down by tight sections and "read these
  next" pointers rather than inlined depth.

- **What it consolidates from `CLAUDE.md`.** The layer-model tour (a 50-line
  digest of CLAUDE.md's "Architecture"), the load-bearing contracts (audit
  immutability / tenantId / encryption manifest / `as any` ratchet — pulled from
  Epics A/B/C and "Codebase-hygiene ratchets"), and the testing/CI posture (from
  "Failing tests"). Each is a *digest with a pointer*, never a re-teach —
  CLAUDE.md stays the single source of truth and there's no second copy to drift.

- **"Read these next" is curated to 8, not 92.** The value is the *filter*. The
  ratchet pins it at exactly 8 resolvable entries so it can't quietly bloat back
  toward the full `docs/` tree.

- **Honest correction found while writing.** `README.md` claimed "Node.js 18+";
  `.nvmrc` and `engines` require Node 24. Fixed README rather than document the
  wrong version — a new contributor on Node 18 would fail to start the app.

- **The first-PR example is a real vertical slice** ("add a `framework` filter to
  the Controls list"), naming the actual files in edit order
  (`ControlRepository.ts` → `control/queries.ts` → controls route → unit test) so
  it's copy-pasteable, not illustrative.

## Verification

- `npx jest tests/guardrails/contributing-doc-coverage.test.ts` — 5/5 (exists, 9
  H2 sections, exactly-8 resolvable "read these next" links, README + CLAUDE
  cross-link).
- The "fresh-clone, time-the-loop" check in the brief is a human step (run a new
  contributor through it); the doc is structured to make that loop < 4h.
