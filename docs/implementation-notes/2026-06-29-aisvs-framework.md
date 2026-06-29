# 2026-06-29 — OWASP AISVS as an assessable AI-security framework

**Commit:** _(this PR)_ `feat(frameworks): OWASP AISVS as assessable AI-security framework`

## Design

AISVS v1.0 (OWASP AI Security Verification Standard, github.com/OWASP/AISVS)
ships as framework **content** on Inflect's existing data-driven framework
library — the same path as ISO 27001 / NIS2 / NIST CSF 2.0 / SOC 2 / DORA. No
new machinery: a YAML library file, a seed fixture + seed block, two crosswalk
mapping files, a sync script, picker provenance, and a structural ratchet.

AISVS maps cleanly onto IC's URN schema: 12 chapters → depth-1 grouping nodes,
44 sections → depth-2 grouping nodes, 191 requirements → depth-3 assessable
leaves. The three AISVS verification levels (L1/L2/L3) are modelled as IC's
1–3 assessment scale (`scores_definition`); each requirement also carries its
own level in the node annotation.

## License handling — CC-BY-SA-4.0 (the load-bearing decision)

AISVS is **CC-BY-SA-4.0 (ShareAlike)**, not MIT/CC-BY. Embedding the full
verbatim requirement prose into IC's proprietary framework YAML would risk a
share-alike obligation on that file. We therefore store a **reference INDEX,
not a copy**:

- each requirement node carries the canonical **AISVS ID** (`C<ch>.<sec>.<req>`),
  its **level** (L1/L2/L3, in `annotation`), and a **SHORT paraphrased title**
  (`name`, ≤ 12 words) — never the verbatim OWASP sentence;
- the `annotation` links to the **canonical OWASP text** for the full wording;
- `copyright` carries the CC-BY-SA-4.0 attribution to OWASP + source URL +
  pinned version.

Facts + IDs are not copyrightable; the prose is. The ratchet enforces this with
a length/word ceiling on every title (a verbatim paste — AISVS requirements run
20–40+ words — trips it). **FLAGGED FOR LEGAL SIGN-OFF in the PR:** if legal is
comfortable with verbatim text under an isolated CC-BY-SA sidecar, the prose
could later live in a clearly-licensed sidecar file; until then we paraphrase.

`scripts/sync-owasp-aisvs.ts` re-fetches the AISVS markdown and re-derives the
**ID/level index only** (never the prose), reporting drift so a maintainer can
hand-author paraphrases for new/changed requirements.

## Per-AI-system scoping

AISVS applies to AI-**enabled systems**, of which a tenant may run several (or
none) — unlike ISO 27001 (org-wide). We did NOT over-build an AI-system
discovery/registry. The documented model: a tenant runs **one AISVS assessment
per AI system** they operate (install the pack / assess the requirements once
per system). Chapter applicability by archetype:

| Archetype | Applies | Mark N/A |
|---|---|---|
| Prompt-completion (no retrieval/agents) | C1–C7, C11, C12 | C8, C9, C10 |
| RAG (embeddings/vector DB) | + C8 | C9, C10 |
| Agentic / tool-using | + C9 | — |
| MCP-integrated | + C10 | — |

## Crosswalk provenance

`aisvs-to-nist-csf.yaml` (→ NIST CSF 2.0 PROTECT/DETECT, plus ID/RS/RC/GV) and
`aisvs-to-iso27001.yaml` (→ ISO 27001:2022 A.5/A.8 technical controls) let a
tenant's AISVS work surface its overlap with frameworks they already run. Every
entry is marked **`[curated]`** — these mappings are Inflect's judgement, NOT
part of the OWASP standard. Only target refs present in the respective library
YAMLs are referenced (the ratchet rejects dangling refs).

## Files

| File | Role |
|---|---|
| `src/data/libraries/owasp-aisvs-1.0.yaml` | The framework library (index, not prose) |
| `prisma/fixtures/owasp_aisvs_requirements.json` | Seed fixture (assessable reqs, in sync with the YAML) |
| `prisma/seed.ts` | AISVS framework + requirements + 12 chapter packs + `AISVS_BASELINE` pack |
| `src/data/libraries/mappings/aisvs-to-nist-csf.yaml` | Curated AISVS → NIST CSF 2.0 crosswalk |
| `src/data/libraries/mappings/aisvs-to-iso27001.yaml` | Curated AISVS → ISO 27001:2022 crosswalk |
| `scripts/sync-owasp-aisvs.ts` | Re-derive the ID/level index from upstream; report drift |
| `src/app/t/[tenantSlug]/(app)/frameworks/FrameworksClient.tsx` | Picker provenance (OWASP + CC-BY-SA-4.0 + canonical-text note) |
| `tests/guardrails/aisvs-framework-coverage.test.ts` | Structural ratchet |

## Decisions

- **`kind: INDUSTRY_STANDARD`** — AISVS is a community/industry standard; the
  Prisma `FrameworkKind` enum already has the value, so no migration.
- **Two representations** (seed key `OWASP-AISVS` vs library `ref_id` `AISVS-1.0`)
  mirror the established DORA pattern; mappings key off the library `ref_id`
  because the importer resolves against the library-imported rows.
- **Picker provenance is generic** — `parseProvenance(metadataJson)` surfaces
  `provider` + `license` for ANY framework that carries them, not an AISVS
  special-case. Both the importer and the seed write the same metadata shape.
- **One control template per chapter** (12), not per requirement (191) — keeps
  the installable pack legible while the framework requirements remain the
  assessable unit.
