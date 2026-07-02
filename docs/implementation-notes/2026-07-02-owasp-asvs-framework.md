# 2026-07-02 — OWASP ASVS 4.0.3 framework library

**Commit:** `<pending> feat(frameworks): OWASP ASVS 4.0.3 library + L1 starter pack`

## Design

Adds the OWASP Application Security Verification Standard (ASVS) 4.0.3 as a
first-class framework library, end-to-end, following the CIS Controls v8 /
NIST SSDF precedent. No new Prisma models — it rides the generic
Framework / FrameworkRequirement / FrameworkPack / ControlTemplate /
RiskTemplate machinery.

Structure:

- **Library YAML** (`src/data/libraries/owasp-asvs-4.0.3.yaml`) — 14 chapters
  (V1-V14) as `depth:1 assessable:false` parents; requirements as
  `depth:2 assessable:true` children with `ref_id` = the V-prefixed
  requirement number (e.g. `V2.1.1`). The verification level (L1/L2/L3) is
  encoded in `category`; a requirement's level is the LOWEST level at which it
  applies (L1 ⊂ L2 ⊂ L3).
- **L1 starter pack** — one curated control template per chapter that carries
  L1 requirements (13 chapters; V1 is L2+ only), each linked to the specific
  L1 requirement codes it satisfies, with ≥1 implementation task each, plus
  8 application-security RiskTemplates.
- **Two mapping sets** — `asvs-to-iso27001.yaml` (→ ISO 27001:2022 Annex A) and
  `asvs-to-ssdf.yaml` (→ NIST SSDF SP 800-218). Together they cover every L1
  requirement as a source; targets are real ref_ids in those libraries.

### Licensing

OWASP ASVS is licensed **CC BY-SA 4.0** (ShareAlike). ShareAlike would force
relicensing of derivative content, which is incompatible with a proprietary
product. So the library reuses ONLY the factual identifiers (chapter/requirement
numbers), the short factual titles, and the L1/L2/L3 structure. **Every
`description:` is original paraphrase** — no ASVS sentences are copied. The YAML
header states this posture and links the authoritative standard.

### Scope of authored content

ASVS 4.0.3 has ~286 requirements. This library authors **259** requirements in
original prose: **128 L1** (the full Level 1 baseline), **119 L2**, and **12 L3**
— all 14 chapters represented, all L1 requirements covered in full plus a
representative L2/L3 set (V1 is entirely L2/L3). The `asvs-starter-pack-coverage`
ratchet pins these counts, so the authored set can only grow deliberately.

## Files

| File | Role |
| --- | --- |
| `src/data/libraries/owasp-asvs-4.0.3.yaml` | Framework library (14 chapters, 259 requirements) |
| `prisma/fixtures/asvs-requirements.json` | FrameworkRequirement seed rows |
| `prisma/fixtures/asvs-l1-control-templates.json` | L1 starter-pack control templates + tasks |
| `src/data/libraries/mappings/asvs-to-iso27001.yaml` | ASVS L1 → ISO 27001:2022 Annex A |
| `src/data/libraries/mappings/asvs-to-ssdf.yaml` | ASVS L1 → NIST SSDF SP 800-218 |
| `prisma/seed.ts` | Seeds framework `OWASP-ASVS`, pack `ASVS_L1_PACK`, risk templates |
| `tests/guardrails/asvs-starter-pack-coverage.test.ts` | Per-framework coverage ratchet |
| `tests/guardrails/framework-starter-pack-completeness.test.ts` | Registered ASVS in `STARTER_PACKS` |

## Decisions

- **`kind: INDUSTRY_STANDARD`** — reused the existing enum value (as CIS did),
  not a new one.
- **V-prefixed ref_ids** (`V2.1.1`, chapter `V1`) per the ASVS convention, used
  consistently across library, fixtures, pack links, and mapping sources so refs
  resolve without translation.
- **Distinct from `owasp-aisvs-1.0.yaml`** — that is the AI Security Verification
  Standard (ref_id `AISVS-1.0`); ASVS is `OWASP-ASVS-4.0.3`. No collision.
- **One control template per chapter** (not per requirement) matches CIS pack
  density and keeps day-one coverage legible.
- **Mappings use `RELATED`/`INTERSECT` honestly** — ASVS requirements are
  finer-grained than ISO Annex A controls or SSDF tasks, so most links are
  contributory rather than equivalent.
