# 2026-06-30 — AISVS L2: AI risk-assessment output safety gate

**Commit:** `<sha> feat(ai): AISVS L2 output safety gate (C7.2.2/C7.3.2/C7.3.3/C5.2.4)`

## Context

IC's risk-assessment AI is **AISVS v1.0 L1-verified** for its applicable
chapters (see `docs/security/aisvs-self-assessment.md`). This is **PR 1 of 4**
in the L1→L2 uplift. It closes the output-side L2 gaps; the badge flips to
"L2-verified" only in PR 4, once every applicable L2 requirement is met.

## What this closes

The AI output was Zod **shape**-validated only. Four L2 requirements wanted
the output *content* gated:

| AISVS | Requirement | Before | After |
|---|---|---|---|
| C7.3.2 / C5.2.4 | filter system prompt / internal data from output | none | `SYSTEM_LEAK_PATTERNS` redact leaked trust-boundary markers, role preamble, "ignore previous instructions", "system prompt/message" |
| C7.3.3 | prevent outputs triggering outbound requests | none | `stripOutboundContent` removes URLs / markdown images+links / HTML / `data:` URIs |
| C7.2.2 | block low-confidence answers | confidence scored (C7.2.1) but surfaced anyway | suggestions below `MIN_CONFIDENCE = 'medium'` dropped from the surfaced set |

## Design

`output-guard.ts::applyOutputGuard(output)` is a **pure** function run at the
usecase boundary in `risk-suggestions.ts`, AFTER `RiskSuggestionOutputSchema`
shape-validation and BEFORE persistence. Placing it there means:

- it applies uniformly to **every** provider (OpenRouter + the deterministic
  stub) — one call site, not per-provider;
- the **persisted** suggestion text is already clean, so every downstream
  reader (UI, PDF export, audit-pack share link, SDK) is protected — the same
  "sanitise at the usecase layer, not just at render" rule Epic C.5 set for
  user rich-text;
- it is exhaustively unit-testable (pure in → out).

The gate returns `{ suggestions, redactions, droppedLowConfidence }`; the
counts ride the generation audit row as a safety signal (the full structured
safety-decision log is PR 3).

## Files

| File | Role |
|---|---|
| `src/app-layer/ai/risk-assessment/output-guard.ts` | The pure gate: leak redaction + outbound strip + confidence floor. |
| `src/app-layer/usecases/risk-suggestions.ts` | Wires the gate before persistence; surfaces counts on the audit row. |
| `tests/unit/ai-output-guard.test.ts` | Adversarial behavioral proof per requirement. |
| `tests/guardrails/ai-aisvs-hardening-coverage.test.ts` | Extended with the L2 output-gate structural lock. |
| `docs/security/aisvs-self-assessment.md` | C7/C5 rows updated with the L2 controls (badge unchanged until PR 4). |

## Decisions

- **Drop, not flag, low-confidence (C7.2.2).** "Block or fall back" reads as
  *block*; dropping below-floor confidence is the stronger reading. The apply
  flow is already human-gated, so a dropped low-confidence draft is no loss —
  and the drop count is audited.
- **Redact, not reject, on leak.** A single leaked phrase shouldn't discard an
  otherwise-useful suggestion; redacting the offending span preserves signal
  while removing the leak. The redaction count surfaces how often it fires.
- **Markdown link text preserved, href dropped.** `[click here](http://evil)`
  → `click here` — keep the human-readable content, kill the outbound target.
- **Gate at storage, not render.** Matches Epic C.5; a render-only filter would
  leave the row dangerous to PDF export + audit-pack consumers.
