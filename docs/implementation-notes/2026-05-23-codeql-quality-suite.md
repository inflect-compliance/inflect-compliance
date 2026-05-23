# 2026-05-23 — Widen CodeQL suite to security-and-quality

**Commit:** `<pending> chore(codeql): widen suite to security-and-quality`

## Design

GitHub Code Scanning has two views into CodeQL output:

  - **Security** tab — alerts whose rule has `security_severity_level`
    set (`critical`/`high`/`medium`/`low`). Populated by the
    `security-extended` query suite.
  - **Code quality / Standard findings** tab — alerts whose rule has
    `security_severity_level: null` (maintainability rules:
    `js/unused-local-variable`, `js/useless-assignment-to-local`,
    `js/redundant-conditional`, `js/comparison-of-identical-expressions`,
    …). Populated ONLY by the `security-and-quality` suite, which is
    a strict superset of `security-extended` plus the maintainability
    queries.

The CodeQL config was previously pinned to `security-extended` to fix
a 2026-04-30 configuration-error banner (language-list autodetection
mismatch). That pin had the secondary effect of disabling the quality
suite — the "Code quality / Standard findings" tab on the repo's
Security page was empty not because the code was perfect but because
the rules were never run.

This change flips the pin to `security-and-quality`. Strictly
broader: every security query that ran before still runs. Quality
queries run additionally. The same triage policy applies — fix the
finding, or dismiss with a `dismissed_reason` ∈
{`won't fix`, `false positive`, `used in tests`} and a substantive
comment naming the specific reason.

The choice is locked structurally by a sibling ratchet so a future
"speed CI up" revert can't silently re-hide quality alerts.

## Files

| Path | Role |
|------|------|
| `.github/codeql/codeql-config.yml` | `queries: [security-and-quality]` (was `security-extended`); `name:` follows; rationale block expanded |
| `tests/guards/codeql-suite-pinning.test.ts` | Structural ratchet — fails CI if `queries:` drops to `security-extended` or any narrower suite; `name:` must mention `security-and-quality` for UI labelling |
| `docs/implementation-notes/2026-05-23-codeql-quality-suite.md` | This note |

## Decisions

- **`security-and-quality` over `security-extended`** — the quality
  suite catches dead code and accidental no-ops that linting alone
  doesn't. ESLint's `no-unused-vars` runs in our pipeline but its
  signal is muted (intentional warn level — see
  [[project_pending_roadmap_6]] for the `as any` ratchet rationale).
  CodeQL's `js/unused-local-variable` is the same class of finding
  surfaced on a different cadence and a different review surface
  (the Security UI) — useful as a second line.
- **Triage policy mirrors security findings.** Quality alerts don't
  get a lower bar. Either fix (delete the unused local, finish the
  conditional) or dismiss with a substantive `dismissed_comment`
  naming the specific reason — same as the security alerts
  documented in [[project_security_quality_clean.md]]. The
  "dismissed without comment" smell from the security backlog is a
  failure mode this policy refuses for the quality backlog too.
- **The structural ratchet is the load-bearing piece.** Without it
  a contributor with "CI feels slow today" energy could revert this
  with one line and the gap silently reopens. The guard's failure
  message names the specific regression so the next person sees the
  reasoning, not just a red test.
- **No paths-ignore expansion.** Tempting to pre-emptively ignore
  generated files / test fixtures for the new noise the quality
  suite produces, but premature: see what the alerts actually look
  like first, then narrow with `dismissed_reason: used in tests` if
  warranted. Blanket excludes would also drop genuinely useful
  signal — e.g. an unused export in a test helper is real dead code.

## Follow-up

P1 (next PR) enumerates the resulting Quality alerts via
`gh api .../code-scanning/alerts?tool_name=CodeQL&state=open`, groups
by rule, and runs through them rule-by-rule. P2..PN are per-rule fix
waves. The roadmap ends when `state=open` returns `[]` for both
Security and Quality, with the suite pin held by this ratchet.
