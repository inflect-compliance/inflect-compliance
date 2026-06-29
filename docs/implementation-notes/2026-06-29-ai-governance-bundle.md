# 2026-06-29 — AI-governance bundle: AISVS + ISO 42001 + EU AI Act crosswalk

**Commit:** _(this PR)_ `feat(ai-governance): three-way crosswalk AISVS ↔ ISO 42001 ↔ EU AI Act`

## What this completes

The capstone of a three-PR sequence that makes IC's AI-governance offering
coherent across the three layers a real AI-governance programme needs:

| Layer | Framework | PR |
|---|---|---|
| Technical AI-security verification | **AISVS v1.0** | #1328 |
| AI management system | **ISO/IEC 42001:2023** | #1331 |
| Regulation | **EU AI Act (2024/1689)** | #1332 |

This PR adds the **three-way crosswalk** so a tenant's AISVS technical work
rolls up into their ISO 42001 management system and their EU AI Act obligations
— surfaced through IC's **existing** cross-framework traceability surface, no
bespoke dashboard.

## The crosswalks (the integration value)

| File | Direction | Entries |
|---|---|---|
| `aisvs-to-iso-42001.yaml` | technical controls → management-system clauses/controls | 14 |
| `aisvs-to-eu-ai-act.yaml` | technical controls → regulatory obligations | 13 |
| `iso-42001-to-eu-ai-act.yaml` | management system → regulation | 15 |

E.g. completing AISVS **C7** (output control) traces to ISO 42001 **A.6.2.6**
(operation/performance monitoring) and EU AI Act **Art 15** (accuracy/
robustness). All entries are **`[curated]`** — Inflect's judgement of conceptual
alignment, NOT part of any source standard. Every mapped node resolves against
the libraries (the bundle ratchet rejects dangling refs).

## Per-source license matrix (the load-bearing constraint)

Each source needed different handling — all three are correct:

| Source | License | Handling |
|---|---|---|
| **AISVS** | CC-BY-SA-4.0 (ShareAlike) | reference **index** — IDs + levels + paraphrased titles, link to canonical text; never verbatim prose |
| **ISO/IEC 42001** | ISO copyright | **paraphrase only** — clause/control numbers + short paraphrased titles + `(Paraphrase)` markers; never ISO text |
| **EU AI Act** | EU legislation = **public domain** | article text/titles **used directly** |

The crosswalk files themselves contain only IDs + Inflect's own rationale prose,
so they carry no third-party license obligation.

## EU AI Act risk-tier model

The AI Act framework is organised by its **risk tiers** (prohibited / high-risk
/ limited / GPAI / minimal) as top-level grouping nodes. A tenant classifies
each AI system into a tier; that decides which tiers/obligations apply (others
marked N/A). No AI-system registry was built — the tier grouping + N/A marking
is the "light" classification.

## Not legal advice (the boundary)

Risk-tier classification of an AI system is a **tenant + legal-counsel
decision** — IC provides the obligation structure and the crosswalks, NOT a
legal determination. The disclaimer is carried in the EU AI Act framework, the
two EU-AI-Act crosswalk descriptions, and this note.

## Reused surfaces (no bespoke dashboard)

The crosswalks are auto-discovered by `importAllMappingSets` (during
`syncAllLibraries`) and surface through the **existing** `/mapping`
cross-framework traceability page + the standard coverage flow + the control-
detail mappings tab. The bundle ratchet asserts those surfaces exist and that
no one-off `ai-governance` page was introduced.

## Files

| File | Role |
|---|---|
| `src/data/libraries/mappings/aisvs-to-iso-42001.yaml` | AISVS → ISO 42001 crosswalk |
| `src/data/libraries/mappings/aisvs-to-eu-ai-act.yaml` | AISVS → EU AI Act crosswalk |
| `src/data/libraries/mappings/iso-42001-to-eu-ai-act.yaml` | ISO 42001 → EU AI Act crosswalk |
| `tests/guardrails/ai-governance-bundle-coverage.test.ts` | Bundle ratchet (frameworks + licenses + crosswalks + reused surfaces) |

## Decisions

- **Crosswalk direction** mirrors the value flow (technical → management →
  regulation), so coverage in a lower layer advances the higher layers.
- **Refs key off library ref_ids** (`AISVS-1.0` / `ISO42001-2023` /
  `EU-AI-ACT-2024`) — the importer resolves against library-imported rows, per
  the established mapping convention.
- **Reuse over bespoke** — the existing traceability/coverage surfaces already
  render `RequirementMappingSet`s; adding a separate AI-governance dashboard
  would duplicate them.
