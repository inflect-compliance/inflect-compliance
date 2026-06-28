# 2026-06-28 — DORA (EU 2022/2554) framework

**Commit:** _(pending)_ `feat(frameworks): add DORA (EU 2022/2554)`

## Design

DORA — the Digital Operational Resilience Act, Regulation (EU) 2022/2554 —
is shipped as **content + seed**, riding Inflect's existing data-driven
framework-library machinery. No new code paths, no schema changes, no
DORA-specific branching anywhere in the install/catalog usecases.

Source of truth is the **official regulation** (EU 2022/2554), structured by
its five pillars. The requirement node `ref_id`s follow the official article
numbering (`DORA.Art.5`, `DORA.Art.6`, …) so they stay stable and citable.

Five pillars (29 nodes = 5 pillar groupers + 24 assessable article nodes):

| Pillar | Chapter / Articles | Assessable articles |
|--------|--------------------|---------------------|
| 1. ICT Risk Management | Ch. II (Art 5–16) | 5,6,7,8,9,10,11,12,13,14,16 |
| 2. ICT Incident Management & Reporting | Ch. III (Art 17–23) | 17,18,19,23 |
| 3. Digital Operational Resilience Testing | Ch. IV (Art 24–27) | 24,25,26,27 |
| 4. ICT Third-Party Risk Management | Ch. V (Art 28–44) | 28,29,30,31 |
| 5. Information Sharing | Ch. VI (Art 45) | 45 |

The codebase carries **two parallel representations** of every framework
(this is the established pattern, not new):

1. **Seed** (`prisma/seed.ts` + `prisma/fixtures/dora_requirements.json`) —
   creates a demo `Framework{key:'DORA', version:'2022/2554',
   kind:'REGULATION'}` with `FrameworkRequirement` codes = the article keys,
   plus DORA `ControlTemplate`s and a `DORA_BASELINE` `FrameworkPack`. Mirrors
   the NIS2 seed exactly.
2. **YAML library** (`src/data/libraries/dora-2022.yaml`) — the source the
   library-importer/install flow reads. The importer writes
   `Framework.key = library ref_id` (`DORA-2022`) and
   `FrameworkRequirement.code = node ref_id` (`DORA.Art.N`). A guardrail
   asserts the seed-fixture codes and the library assessable ref_ids stay in
   sync.

`kind` is `REGULATION` (not `EU_DIRECTIVE` like NIS2): DORA is a directly
applicable Regulation. The existing `FrameworkKind` enum already had
`REGULATION` — no enum change needed.

## Cross-framework mappings

DORA overlaps heavily with NIS2 and ISO 27001, so two standalone mapping
sets feed the existing cross-framework-traceability view for free:

- `src/data/libraries/mappings/dora-to-nis2.yaml` (16 entries) — e.g. DORA
  Art.19 major-incident reporting ↔ NIS2-RE (≈ NIS2 Art.23); DORA Art.28
  third-party risk ↔ NIS2-SC supply chain.
- `src/data/libraries/mappings/dora-to-iso27001.yaml` (20 entries) — e.g.
  DORA Art.12 backup ↔ A.8.13; Art.28/30 third-party ↔ A.5.19/A.5.20;
  Art.45 info-sharing ↔ A.5.7 threat intelligence.

Provenance is tagged in every rationale: `[official-overlap]` (explicit in
the legal texts) vs `[curated]` (Inflect judgement). Every mapping ref
resolves against the YAML libraries — the guardrail fails on any dangling
ref, and the mappings only target ISO Annex A controls that actually exist
in `iso27001-2022.yaml` (e.g. A.5.21/A.5.22 are absent and deliberately not
referenced).

## Install flow — rides the generic machinery

DORA installs through the **same** `previewPackInstall` / `installPack` /
`computeCoverage` usecases as every other framework. The integration test
(`tests/integration/dora-framework-install.test.ts`) seeds a REGULATION-kind
DORA framework + pack and drives the generic usecases end-to-end:
preview → install (controls + tasks + requirement links) → idempotent
re-install (0 new) → 100% coverage. No special-casing was needed; the
guardrail asserts the install/catalog usecases contain no `DORA` literal.

## Incident reporting — separate scope

DORA's incident-reporting pillar (Art 17–23) carries its own notification
deadlines (initial / intermediate / final reports), distinct from but
parallel to NIS2 Art.23. There is **no generic Incident model/workflow in
the codebase today** (the NIS2 incident-response workflow did not land), so
this PR only seeds the requirements. If/when a generic incident workflow
ships, DORA incidents should reuse it with a DORA-flavoured deadline profile
— that is deliberately out of scope here.

## Files

| File | Role |
|------|------|
| `src/data/libraries/dora-2022.yaml` | DORA framework library (5 pillars, 24 articles) — install-flow source |
| `prisma/fixtures/dora_requirements.json` | Seed fixture (24 assessable article requirements) |
| `src/data/libraries/mappings/dora-to-nis2.yaml` | DORA → NIS2 cross-framework mappings |
| `src/data/libraries/mappings/dora-to-iso27001.yaml` | DORA → ISO 27001 cross-framework mappings |
| `prisma/seed.ts` | Adds DORA framework + requirements + control templates + `DORA_BASELINE` pack (mirrors NIS2) |
| `tests/guardrails/dora-framework-coverage.test.ts` | Structural ratchet (library validates, 5 pillars, codes-in-sync, mappings resolve, no special-casing) |
| `tests/integration/dora-framework-install.test.ts` | DB-backed proof DORA installs via the generic pack flow |

## Decisions

- **Content, not code.** DORA adds zero machinery — the gap was missing
  content next to the EU frameworks Inflect already leads with (NIS2). Govrix
  (MIT) only validated that the gap exists; its 22-requirement reduction and
  its vanilla stack were not used — the structure is sourced from the
  official regulation.
- **`kind: REGULATION`**, not a new `EU_REGULATION` enum value — DORA is a
  Regulation and the existing enum already distinguishes `REGULATION` from
  `EU_DIRECTIVE` (NIS2). Avoided a needless schema migration.
- **Article-numbered ref_ids** (`DORA.Art.N`) keep requirements citable and
  let the seed fixture and YAML library share one code vocabulary (locked by
  the guardrail).
- **Mappings only reference controls that exist** in the target YAML
  libraries — the guardrail's no-dangling-ref check is the enforcement, so a
  future ISO/NIS2 library edit that drops a referenced control fails CI.
