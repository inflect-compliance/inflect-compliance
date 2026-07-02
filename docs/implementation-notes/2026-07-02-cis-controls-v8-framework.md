# 2026-07-02 — CIS Critical Security Controls v8 framework

**Commit:** `<pending> feat(frameworks): add CIS Critical Security Controls v8`

## Design

CIS Controls v8 lands as a first-class framework library, mirroring the NIST
SSDF precedent, with no new Prisma models — it rides the existing
`Framework` / `FrameworkRequirement` / `FrameworkPack` / `ControlTemplate` /
`RiskTemplate` machinery.

Shape:

```
src/data/libraries/cis-controls-v8.yaml   (18 controls depth:1 assessable:false)
                                          (153 safeguards depth:2 assessable:true)
   IG tier encoded in `category` (IG1/IG2/IG3 — lowest group a safeguard belongs to)
        │
        ├── prisma/seed.ts  → Framework key 'CIS-V8' v8
        │                     153 FrameworkRequirement rows (code = safeguard number)
        │                     FrameworkPack 'CIS_V8_IG1_PACK' (15 control templates)
        │                     8 cyber-hygiene RiskTemplates (frameworkTag 'CIS')
        │
        └── mappings/cis-v8-to-iso27001.yaml   (source CIS-CONTROLS-V8 → ISO Annex A)
            mappings/cis-v8-to-nist-csf.yaml   (source CIS-CONTROLS-V8 → CSF 2.0 subcats)
```

### Licensing

CIS Controls v8 are (c) Center for Internet Security under **CC BY-NC-SA 4.0**
(NonCommercial + ShareAlike). We ship a commercial product, so we may **not**
embed CIS's descriptive prose. The library reuses only the factual identifiers
(Control numbers 1-18, Safeguard numbers such as "1.1"), the short factual
safeguard titles, and the IG1/IG2/IG3 taxonomy. **Every `description:` field is
our own original paraphrase** of the safeguard's intent — no CIS sentences are
copied. The YAML header states this, links the authoritative source
(https://www.cisecurity.org/controls), and the coverage ratchet enforces the
posture (short/original descriptions, no long verbatim lines).

### Starter pack

The IG1 (essential cyber-hygiene) safeguards form the day-one baseline: 56 IG1
safeguards spread across 15 controls become 15 curated control templates (one
per control that carries IG1 safeguards), each linked to the specific safeguard
requirements it satisfies, with default tasks, frequency, and owner hint — so
installing the pack yields real mapped coverage, not a bare 0%. Prefix `CIS-`
keeps them distinct from other packs.

## Files

| File | Role |
| --- | --- |
| `src/data/libraries/cis-controls-v8.yaml` | Framework library — 18 controls + 153 safeguards, IG tiers, original descriptions |
| `src/data/libraries/mappings/cis-v8-to-iso27001.yaml` | Mapping set → ISO/IEC 27001:2022 Annex A (all IG1 + selected IG2) |
| `src/data/libraries/mappings/cis-v8-to-nist-csf.yaml` | Mapping set → NIST CSF 2.0 subcategories |
| `prisma/fixtures/cis-v8-requirements.json` | 153 safeguard rows (code/title/section/IG category) for seed |
| `prisma/fixtures/cis-v8-ig1-control-templates.json` | 15 curated IG1 control templates + tasks + requirement links |
| `prisma/seed.ts` | Seeds CIS-V8 framework, requirements, IG1 pack, 8 cyber-hygiene risk templates |
| `tests/guardrails/cis-starter-pack-coverage.test.ts` | Per-framework coverage ratchet (structure, licensing, pack, mappings) |
| `tests/guardrails/framework-starter-pack-completeness.test.ts` | Registered CIS in `STARTER_PACKS` |

## Decisions

- **IG tier goes in `category`.** The requirement-node schema has no dedicated
  tier field; `category` is the natural home and the coverage test asserts every
  safeguard carries IG1/IG2/IG3 with all three present. Parent controls use the
  control name as their category (they are non-assessable groupers).
- **Two-level hierarchy (control → safeguard),** unlike SSDF's three levels
  (group → practice → task). CIS v8 is genuinely two levels; forcing a third
  would be invention.
- **Mapping targets are constrained to ref_ids that actually exist** in the
  shipped ISO 27001 and NIST CSF libraries (both are curated subsets). Where no
  exact ISO/CSF control exists, the mapping uses `RELATED` — honest per the
  schema's own definition ("conceptually related but not equivalent"). All 56
  IG1 safeguards are covered across the two files; the ISO file additionally
  carries selected IG2 mappings for substance.
- **No i18n entries.** Framework display names come from the library `name`
  field / DB, not from `messages/*.json` (verified: no `NIST-SSDF` / `AISVS` /
  `ISO27001-2022` keys exist there). The `mapping` block in `en.json` only holds
  two ad-hoc UI labels, not a framework-name enumeration.
- **No new models** — the CIS offering is pure data + seed wiring on existing
  tables, so the retention/index guardrails are untouched.
