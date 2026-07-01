# 2026-07-01 — SSDF Starter Pack (control + risk templates)

**Commit:** `feat(frameworks): SSDF Starter Pack — control + risk templates`

## Design

The NIST SSDF framework (2026-07-01-ssdf-framework.md) shipped the requirement
taxonomy plus an auto-generated one-control-per-practice baseline. That is
structurally complete but generic. The Starter Pack adds the **curated** layer:
higher-quality controls that give an SSDF adopter a real coverage baseline on
day one, plus the risk templates for the failure modes SSDF exists to prevent.

Quality over count — 19 controls (one per SSDF practice), each authored with a
description, an owner hint, a sensible default cadence, concrete default tasks,
and explicit links to the SSDF task requirement(s) it satisfies:

```
prisma/fixtures/ssdf-control-templates.json   (19 curated controls)
   └─ ControlTemplate (code SDLC-*, category 'Secure Development')
        ├─ ControlTemplateTask   (2–3 concrete steps)
        └─ ControlTemplateRequirementLink → SSDF task ref (PO.1.1, PW.8.2, …)
   packaged as FrameworkPack SSDF_STARTER_PACK
```

Distinct `SDLC-` code prefix so the curated controls never merge into the
auto-generated `SSDF-NN` baseline pack (which is queried by `startsWith:
'SSDF-'`). Both packs coexist; the Starter Pack is the recommended one.

Seven SSDF risk templates (`frameworkTag: 'SSDF'`, category 'Secure
Development') ride the same `RiskTemplate → createRiskFromTemplate` path as
every other template — no new machinery.

## Files

| File | Role |
| --- | --- |
| `prisma/fixtures/ssdf-control-templates.json` | 19 curated controls (code/title/description/frequency/owner hint/tasks/requirements) |
| `prisma/seed.ts` | Starter-pack seed block (fixture → templates + tasks + requirement links → SSDF_STARTER_PACK), plus 7 SSDF risk templates |
| `tests/guardrails/ssdf-starter-pack-coverage.test.ts` | Ratchet — control shape, no dangling requirement refs, every group covered, seed wiring, risk templates |
| `tests/guardrails/framework-starter-pack-completeness.test.ts` | GENERALIZED ratchet — every library framework has a starter pack OR is in BARE_FRAMEWORKS with a reason |
| `tests/integration/ssdf-starter-pack-install.test.ts` | DB-backed proof: the fixture installs via the generic flow → 19 controls, 42 tasks, 42 links, 100% coverage |

## Decisions

- **Fixture-backed, not inline arrays.** The curated controls live in a JSON
  fixture (like the framework requirements) so the ratchet and the install test
  can both read the single source of truth and assert control-count + no
  dangling requirement refs.
- **Additive to the baseline, not a replacement.** P1's `NIST_SSDF_BASELINE`
  (generic, one-per-practice) already shipped and seeded. Rather than mutate it,
  the Starter Pack is a second pack with distinct `SDLC-` codes. Adopters get
  the curated pack; the baseline remains as a structural fallback.
- **The generalized completeness ratchet surfaced a real gap.** Enumerating
  every library framework showed SOC 2 ships requirements but **no** control
  starter pack in the current seed (the DB's SOC2 controls are stale from an
  older seed). Rather than pretend otherwise, SOC2-2017 is listed in
  `BARE_FRAMEWORKS` with a written reason flagging the follow-up. NIST-CSF-2.0
  is bare by design (reference/companion clone). Every other library framework
  is wired to a pack. A new framework file that is neither wired nor
  allow-listed now fails CI.
- **No SBOM/CVD tooling.** The risk templates name the failure modes
  (vulnerable dependency, compromised pipeline, unsigned artifact, unpatched
  disclosed vuln, …); the machinery to manage SBOMs or run coordinated
  disclosure is explicitly out of scope.
