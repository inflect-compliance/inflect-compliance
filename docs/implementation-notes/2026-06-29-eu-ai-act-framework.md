# 2026-06-29 — EU AI Act (Regulation (EU) 2024/1689) as a framework

**Commit:** _(this PR)_ `feat(frameworks): EU AI Act (2024/1689) risk-tiered framework`

## Context

Second of the three-PR AI-governance sequence (ISO 42001 → **EU AI Act** →
three-way crosswalk). ISO 42001 (#1331) and AISVS (#1328) are merged; this PR
adds the **regulatory** layer. The crosswalks tying all three together land in
the final PR.

## Design — risk-tiered

The AI Act is **risk-tiered**, so the framework's top-level grouping nodes ARE
the tiers, with the key articles as assessable obligations beneath them:

- **Tier.Prohibited** — Art 5 (banned practices)
- **Tier.HighRisk** — Art 9-15 (risk mgmt, data governance, technical docs,
  logging, transparency, human oversight, accuracy/robustness/cybersecurity) +
  Art 16/17/26/27 (provider + deployer obligations, FRIA)
- **Tier.Limited** — Art 50 (transparency / labelling)
- **Tier.GPAI** — Art 53 (GPAI provider obligations) + Art 55 (systemic-risk GPAI)
- **Tier.Minimal** — Art 95 (voluntary codes of conduct; no mandatory obligations)

21 nodes (5 tier groupings + 16 article obligations). A tenant classifies each
AI system into a tier; that decides which tiers/obligations apply (others are
marked N/A). Seeds the framework (`EU-AI-ACT`/`2024`, `REGULATION`) + obligations
+ one control template per tier + the `EU_AI_ACT_BASELINE` pack via the generic
flow.

## License — public domain

EU legislation is **public domain**, so unlike AISVS (CC-BY-SA-4.0,
index-not-prose) and ISO 42001 (ISO-copyright, paraphrase-only), the AI Act's
**article text may be used directly**. Obligation summaries reference the
official articles; the `copyright` field states public-domain + links EUR-Lex.
This completes the sequence's per-source license matrix.

## Not legal advice (the boundary)

Risk-tier classification of a given AI system is a **tenant + legal-counsel
decision** — IC provides the obligation *structure*, not the legal
determination. The disclaimer is carried in the framework description, every
tier node's description, and the seed metadata (`notLegalAdvice: true`).

## Files

| File | Role |
|---|---|
| `src/data/libraries/eu-ai-act.yaml` | The framework library (risk-tiered, article text) |
| `prisma/fixtures/eu_ai_act_requirements.json` | Seed fixture (in sync with the YAML) |
| `prisma/seed.ts` | EU AI Act framework + obligations + tier packs + `EU_AI_ACT_BASELINE` |
| `tests/guardrails/eu-ai-act-framework-coverage.test.ts` | Structural + risk-tier + license + not-legal-advice ratchet |

## Decisions

- **`kind: REGULATION`** — same as DORA; no migration.
- **Tiers as grouping nodes** (not a new schema field) is the "light risk-tier
  classification" — the tenant marks non-applicable tiers N/A; no AI-system
  registry built (out of scope, would be over-building).
- **Crosswalks deferred** to the final PR (AISVS→EU-AI-Act, ISO-42001→EU-AI-Act)
  now that both anchor frameworks exist.
