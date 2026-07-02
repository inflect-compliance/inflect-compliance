# 2026-07-02 — Policy-template gap-fill follow-up (physical security + NIS2 master)

**Commit:** `<pending>` feat(policy): add physical-security + NIS2 master policy templates

## Context

#1408 filled the genuinely-absent original policy-template topics (threat &
vulnerability management, corporate governance, data classification & handling,
MDM/BYOD) via `prisma/fixtures/policy-templates-original-gaps.json` + the
framework map + `tests/guards/policy-template-library.test.ts`.

An earlier parallel effort (#1409) had proposed three templates —
Data Classification, Physical & Environmental Security, and a NIS2 Art 21(2)(a)
master policy — but **Data Classification overlapped #1408** and #1409's separate
seed block / guard conflicted with #1408's once it merged. This reworks #1409 to
its **non-overlapping** remainder, folded into #1408's existing structure.

## What

Two ORIGINAL templates added to `policy-templates-original-gaps.json`
(source `IC Original`, 5 numbered house-style sections):

| ref | Template |
| --- | --- |
| ORIG-PHYSICAL-SEC | Physical & Environmental Security Policy (standalone; was only sections inside broader policies) |
| ORIG-NIS2-MASTER | Information Security Management Policy (NIS2) — the Art 21(2)(a) master policy, clause-ref only, no directive prose |

Both are mapped in the existing `policy-template-framework-map.json` (ISO 27001
Annex A + NIS2, `curated` provenance) and covered by extending
`tests/guards/policy-template-library.test.ts` `EXPECTED_REFS` (4 → 6). They seed
and auto-link through the **existing** `originalGapPolicies` path +
`getSuggestedControlLinks`/`linkPolicyControls` — no new machinery.

## Decisions

- **Dropped Data Classification** — #1408's `ORIG-DATA-CLASSIFICATION` already
  covers it; adding a second would duplicate.
- **Folded into #1408's fixture, not a parallel one.** The original #1409 added a
  separate `inflectGapPolicies` seed block + its own guard + a coverage-floor
  bump; that conflicted with #1408 once it merged. Extending #1408's fixture +
  guard keeps a single source of truth.
