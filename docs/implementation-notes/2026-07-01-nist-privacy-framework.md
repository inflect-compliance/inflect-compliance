# 2026-07-01 — NIST Privacy Framework v1.0 (framework library)

**Commit:** `<sha> feat(frameworks): NIST Privacy Framework`

## What + why

IC's framework library had ISO 27001, NIS2, NIST CSF 2.0, SOC 2, ISO 42001,
EU AI Act — but **no privacy framework**. The NIST Privacy Framework v1.0 is
the direct companion to NIST CSF 2.0 (identical Function / Category /
Subcategory structure), so it slots into IC's data-driven library machinery
identically — `nist-csf-2.0.yaml` is the exact clone template.

**Source + license:** the official NIST Privacy Framework v1.0 (NIST,
2020-01-16). NIST content is **public domain** — "Information presented on
NIST sites is considered public information and may be distributed or copied"
— the same copyright line IC already uses for NIST CSF. No license friction
(contrast the copyrighted ISO standards, which IC stores as clause-refs-only).

## Structure shipped

`nist-privacy-framework-1.0.yaml` — the 5 privacy Functions →
18 Categories → 100 Subcategories:

- **IDENTIFY-P** (ID-P): Inventory and Mapping, Business Environment, Risk
  Assessment, Data Processing Ecosystem Risk Management
- **GOVERN-P** (GV-P): Governance Policies, Risk Management Strategy,
  Awareness and Training, Monitoring and Review
- **CONTROL-P** (CT-P): Data Processing Policies, Data Processing Management,
  Disassociated Processing
- **COMMUNICATE-P** (CM-P): Communication Policies, Data Processing Awareness
- **PROTECT-P** (PR-P): Data Protection Policies, Identity Management /
  Authentication / Access Control, Data Security, Maintenance, Protective
  Technology

## Two-representation wiring (the non-obvious part)

A framework has **two representations** in this repo, and a literal CSF clone
only gives ONE:

1. **Library YAML** (`src/data/libraries/*.yaml`) — auto-discovered by
   directory glob; cross-framework mappings resolve against it. NIST CSF lives
   here as *reference only*.
2. **Seed `FrameworkPack`** (`prisma/seed.ts` + a JSON fixture) — the ONLY
   thing that makes a framework **installable by a tenant** and **visible in
   the picker**.

So to ride the generic install flow (no special-casing), this PR mirrors the
**ISO 42001 / AISVS full pattern**, not the bare NIST CSF library:

- `prisma/fixtures/nist_privacy_framework_requirements.json` — generated FROM
  the YAML so the fixture keys exactly equal the YAML assessable ref_ids (the
  ratchet enforces `fixtureKeys === libAssessable`).
- A seed block (after the EU AI Act block): `framework.upsert` (key
  `NIST-PRIVACY`, kind `NIST_FRAMEWORK`, public-domain `metadataJson`) →
  requirement upserts → one `controlTemplate` per Category (codes `PRIV-00..`)
  → `frameworkPack.upsert` (`NIST_PRIVACY_BASELINE`) → pack-template links.

`framework/install.ts` + `framework/catalog.ts` are untouched and contain no
NIST-Privacy branch — it appears in `listInstallableFrameworks` purely because
it has a pack.

## Cross-framework crosswalks (the integration value)

- `mappings/nist-privacy-framework-to-nist-csf.yaml` — PROTECT-P↔CSF PROTECT,
  IDENTIFY-P↔CSF IDENTIFY, etc. Marked `[NIST-crosswalk]`: the relationships
  reflect NIST's published PF↔CSF crosswalk, adapted to IC's condensed CSF
  representation (IC's CSF library is a representative 11-outcome subset, so
  targets resolve to the nearest available node).
- `mappings/nist-privacy-framework-to-iso27001.yaml` — privacy outcomes ↔
  Annex A.5/A.8 controls, most directly **A.5.34** (Privacy and protection of
  PII). Marked `[curated]`.

Both auto-glob via `scanMappingSetDirectory` and import in `library-sync`
Phase 2. The ratchet proves zero dangling refs.

## Decisions

- **ISO 27701 deferred.** The optional ISO-aligned privacy surface (the
  privacy extension to ISO 27001) is a copyrighted standard requiring the
  clause-refs-only / paraphrased-titles handling (like `iso27001-2022.yaml`).
  Bundling it would mix a copyrighted surface into an otherwise clean
  public-domain PR. Gated out per the prompt's "don't bundle if it
  complicates"; it's a clean follow-on if the ISO-aligned privacy management
  surface is a real ask.
- **No GDPR crosswalk.** There is no GDPR-article framework in IC's library
  yet, so `-to-gdpr.yaml` is omitted (it was conditional on a GDPR framework
  landing).
- **Control templates grouped by Category** (18 packs, `PRIV-NN`), mirroring
  ISO 42001's clause-group templates — a sensible baseline-pack granularity.

## Files

| File | Role |
|---|---|
| `src/data/libraries/nist-privacy-framework-1.0.yaml` | The framework (5 Functions / 18 Categories / 100 Subcategories), public-domain. |
| `prisma/fixtures/nist_privacy_framework_requirements.json` | Seed fixture, generated from the YAML (keys == assessable ref_ids). |
| `prisma/seed.ts` | NIST Privacy Framework + `NIST_PRIVACY_BASELINE` pack seed block. |
| `src/data/libraries/mappings/nist-privacy-framework-to-nist-csf.yaml` | PF↔CSF crosswalk ([NIST-crosswalk]). |
| `src/data/libraries/mappings/nist-privacy-framework-to-iso27001.yaml` | PF↔ISO 27001 Annex A crosswalk ([curated]). |
| `tests/guardrails/nist-privacy-framework-coverage.test.ts` | Ratchet: schema, 5 Functions + 18 Categories, public-domain copyright, fixture-sync, seed wiring, crosswalk no-dangling-refs, generic-machinery. |
