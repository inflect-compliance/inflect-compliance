# 2026-07-01 — NIST SSDF (SP 800-218) framework

**Commit:** `feat(frameworks): NIST SSDF (SP 800-218)`

## Design

IC had no secure-software-development framework. The NIST Secure Software
Development Framework (SSDF), SP 800-218 v1.1, is public-domain US-Government
work and slots directly onto IC's existing data-driven library machinery — the
same path used by the NIST Privacy Framework (2026-07-01) and NIST CSF 2.0.

Structure is a three-level tree, mirroring `nist-csf-2.0.yaml` exactly:

```
Practice group (PO/PS/PW/RV)   depth 1, assessable: false
  └─ Practice (PO.1, PW.8, …)   depth 2, assessable: false
       └─ Task (PO.1.1, PW.8.2) depth 3, assessable: true
```

Four groups, 19 practices, 42 assessable tasks (SP 800-218 v1.1 — note PW.3 and
PW.4.3 are intentionally absent from the publication, and PW.4.4 is present):

- **PO** — Prepare the Organization (PO.1–PO.5)
- **PS** — Protect the Software (PS.1–PS.3)
- **PW** — Produce Well-Secured Software (PW.1, PW.2, PW.4–PW.9)
- **RV** — Respond to Vulnerabilities (RV.1–RV.3)

Both representations ship and must stay in sync: the library YAML (auto-
discovered, drives the picker + generic install) and the seed FrameworkPack
(JSON fixture + `frameworkRequirement`/`frameworkPack` upserts). The ratchet
asserts `fixtureKeys === libraryAssessableRefIds`.

The picker/metadata notes that the SSDF underpins US federal secure-software
self-attestation (EO 14028 / OMB M-22-18) — but no attestation export is built;
that is deliberately out of scope.

## Files

| File | Role |
| --- | --- |
| `src/data/libraries/nist-ssdf-800-218.yaml` | Library content — 4 groups → 19 practices → 42 tasks, public-domain NIST copyright |
| `prisma/fixtures/nist_ssdf_requirements.json` | Seed fixture — 42 assessable tasks (key == YAML assessable ref_id) |
| `prisma/seed.ts` | FrameworkPack seed block (NIST-SSDF framework + NIST_SSDF_BASELINE pack), one control template per practice |
| `src/data/libraries/mappings/ssdf-to-nist-csf.yaml` | Crosswalk — PS/PW↔CSF PROTECT/IDENTIFY-RA, RV↔DETECT/RESPOND; `[NIST-crosswalk]` provenance where NIST-described |
| `src/data/libraries/mappings/ssdf-to-iso27001.yaml` | Crosswalk — PW/PS↔Annex A.8 (A.8.25 SDLC, A.8.8 tech-vuln, A.8.24 crypto), `[curated]` |
| `src/data/libraries/mappings/ssdf-to-soc2.yaml` | Crosswalk — secure-dev/change↔CC8.1, vuln response↔CC7.1, `[curated]` |
| `tests/guardrails/ssdf-framework-coverage.test.ts` | Ratchet — schema, groups/practices, task numbering, public-domain copyright, fixture sync, 3 crosswalks (no dangling refs), generic-install guard |

## Decisions

- **Public-domain source, not the unofficial rendering.** Task titles are
  paraphrased from the official SP 800-218 publication; the copyright line is
  the standard NIST public-information notice, so there is no license friction
  (unlike the copyrighted ISO standards, which carry clause refs only).
- **Crosswalk targets adapted to IC's condensed CSF.** IC's CSF library is a
  representative 11-outcome subset. The SSDF→CSF crosswalk maps only to those 11
  nodes (e.g. code-tamper protection → PR.DS-01, threat modeling / testing →
  ID.RA-01, vuln monitoring → DE.CM-01, vuln response → RS.MA-01). Entries that
  reflect NIST's own described relationships are marked `[NIST-crosswalk]`; IC's
  structural guidance is `[curated]`. The ratchet enforces zero dangling refs.
- **Baseline pack now, curated Starter Pack next.** This PR seeds one auto-
  generated control template per practice (generic default tasks) so the
  framework installs with day-one structure. The curated SSDF Starter Pack
  (higher-quality controls + SSDF risk templates) lands in the follow-up.
- **No attestation export.** SSDF supports federal self-attestation, but the
  attestation form/export is out of scope — the metadata records the EO 14028 /
  OMB M-22-18 context only.
