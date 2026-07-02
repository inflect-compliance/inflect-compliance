# 2026-07-01 — Privacy regulatory crosswalk (ISO 27701 + GDPR)

**Commit:** `<pending>` feat(frameworks): ISO 27701 + GDPR frameworks and the privacy crosswalk

## Design

This adds **privacy coverage as DATA** into IC's existing cross-framework
mapping engine — no new engine, no new UI. Installing the two frameworks and
opening a mapped ISO 27001 control surfaces the privacy crosswalk through the
existing ControlMappingsTab and traceability Sankey.

```
ISO 27001 (existing)  ──A.5.34──►  ISO 27701 PIMS  ──Annex A/B──►  GDPR articles
   iso27001-2022.yaml              iso27701-2019.yaml               gdpr.yaml
                       iso27001-to-iso27701.yaml     iso27701-to-gdpr.yaml
```

Two new library frameworks + two new mapping sets drop into
`src/data/libraries/` and are consumed automatically by the library
importer, `mapping-resolution`, ControlMappingsTab, and the Sankey.

## Files

| File | Role |
| --- | --- |
| `src/data/libraries/iso27701-2019.yaml` | ISO/IEC 27701:2019 PIMS — 55 nodes (clauses 5–8, controller Annex A, processor Annex B); OUR OWN paraphrased descriptions |
| `src/data/libraries/gdpr.yaml` | GDPR (EU 2016/679) — 27 key articles as regulatory-reference nodes (verbatim public titles) |
| `src/data/libraries/mappings/iso27001-to-iso27701.yaml` | Bridge (14 entries): ISMS clauses → PIMS clause 5, A.5.34 → controller/processor guidance |
| `src/data/libraries/mappings/iso27701-to-gdpr.yaml` | Core crosswalk (43 entries) — relationships ported from the Microsoft Data Protection Mapping Project (MIT) |
| `prisma/fixtures/iso27701_requirements.json` | ISO 27701 requirements (generated from the yaml) |
| `prisma/fixtures/iso27701-control-templates.json` | 10 curated PIMS starter-pack controls (PIMS-01…10) with tasks + requirement links |
| `prisma/seed.ts` | ISO 27701 framework + requirements + starter pack (`ISO27701_BASELINE`) + 5 privacy risk templates |
| `tests/guardrails/framework-starter-pack-completeness.test.ts` | ISO27701-2019 → STARTER_PACKS; GDPR → BARE_FRAMEWORKS (regulatory-reference) |
| `tests/guardrails/privacy-crosswalk.test.ts` | The ratchet (parse, mapping validity, ISO-copyright discipline, attribution, completeness) |
| `docs/attributions.md` | MS Data Protection Mapping Project (MIT) + ISO/GDPR provenance |

## Decisions

- **Crosswalk, not a privacy program.** This ports the MS project's mapping
  DATA — the ISO 27701 ↔ regulation relationships. It is explicitly NOT a
  DSAR/DPIA/RoPA/retention-by-lawful-basis program (the source repo provides
  no such thing); that is a separate future initiative.
- **ISO-copyright / clause-ref-only.** ISO/IEC 27701 text is ISO-copyrighted and
  the MS project's own README demands respecting it. Every ISO 27701 node carries
  our OWN short description (≤ 200 chars, "(Paraphrase)"), only the clause
  identifier is ported. The `privacy-crosswalk` ratchet caps description length
  and scans for verbatim-ISO markers to lock this.
- **GDPR is a regulatory-reference framework (no starter pack).** GDPR articles
  are mapping TARGETS you map controls to, not a control catalogue. It ships with
  NO control-template starter pack and is listed in the completeness ratchet's
  `BARE_FRAMEWORKS` exemption with that reason. ISO 27701, by contrast, IS a
  control framework and ships a curated starter pack (per the SSDF-established
  completeness rule) so it installs to real mapped coverage, not a bare 0%.
- **ISO 27701:2019, not "-2022".** The task named the file `iso27701-2022.yaml`,
  but ISO/IEC 27701 is a **2019** standard (no 2022 revision as of writing). The
  library is `iso27701-2019.yaml` / ref_id `ISO27701-2019` for factual accuracy;
  the completeness registry and mappings key off that ref_id consistently.
- **`src/data/frameworks.ts` NOT edited.** That file is deprecated legacy
  hardcoded data; the YAML library system auto-discovers `src/data/libraries/*.yaml`
  (no registry to edit). The task's "register in frameworks.ts" is satisfied by the
  library-discovery + seed wiring instead — the intent (installable via the normal
  flow) holds.
- **Two representations (the keying gotcha).** seed.ts wires `Framework.key =
  'ISO27701'` + pack `ISO27701_BASELINE` (the day-one demo baseline); the library
  importer writes `Framework.key = ref_id` (`ISO27701-2019` / `GDPR`). The mapping
  files use library ref_ids (`ISO27701-2019` → `GDPR`) because the mapping importer
  resolves against the library-imported rows — mappings resolve in the DB after
  `syncAllLibraries` runs, not from seed alone.

## Follow-on (wave 2)

The other 8 regimes in the MS project — CCPA, LGPD (Brazil), PIPEDA (Canada),
Australia, Hong Kong, Singapore, South Korea, Turkey — land as wave 2: one
`mappings/iso27701-to-<regime>.yaml` each, plus a GDPR-style regulatory-reference
framework library where the regime isn't already represented. Identical pattern,
same MIT attribution.
