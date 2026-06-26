# 2026-06-26 — NIS2 gap-assessment question set (data layer)

**Commit:** `<pending>` feat(nis2): vendor gap-assessment questions + ingest model

## What

Imported the open-data **NIS2 gap-assessment question set** (15 domains,
116 questions, bilingual EN/DE) from
[NISD2/nis2-gap-assessment-schema](https://github.com/NISD2/nis2-gap-assessment-schema)
as a **data layer only**: vendored fixture + Zod schema + four Prisma
models + RLS migration + seed + repository + sync script. **No UI, no
onboarding, no scoring, no usecases** — those are deliberate follow-ups.

## The licensing decision (load-bearing)

The upstream repo is **dual-licensed**: code MIT, **content CC BY 4.0**.
GitHub's auto-detector reports `NOASSERTION` (it can't parse the custom
dual-license file) — so the LICENSE was read by hand to confirm the claim
before vendoring. CC BY 4.0 is **permissive** (attribution only, *no*
ShareAlike), so — unlike the JupiterOne policy-template repo
(CC-BY-SA-4.0, [[see policy-template-expansion note]]) — the content is
importable **verbatim** with attribution and carries no copyleft
contamination for a commercial product.

Attribution is therefore **mandatory and made load-bearing**:

- baked into the fixture header (`source` / `license` / `attribution`);
- a sidecar `prisma/fixtures/nis2-gap-assessment.LICENSE.md`;
- the ratchet `tests/guardrails/nis2-gap-assessment-coverage.test.ts`
  **fails CI** if either is stripped. The eventual UI MUST also surface
  the credit (out of scope here, noted in the LICENSE file).

## Separate from the NIS2 Framework (critical distinction)

NIS2 is *already* a seeded `Framework` (`key='NIS2'`,
`version='2022/2555'`, requirements from
`prisma/fixtures/nis2_requirements.json`). The gap-assessment questions
are a **different artifact** — a self-assessment checklist, not normative
requirements. They live in their **own** `Nis2GapDomain` /
`Nis2GapQuestion` tables, seeded by a **separate** seed block, and are
**never merged** into `FrameworkRequirement`. The ratchet asserts the
question model has no `frameworkId`.

## German-law caveat

Many questions cite German statutes (`§28 BSIG`, BSI IT-Grundschutz, …).
All 116 are imported and each is **tagged** via `legalBasis` — the
German-specific ones are preserved, not dropped (14 carry a `BSIG`/`§`
citation). The ratchet asserts every question has a non-empty
`legalBasis`.

## Design

```
upstream JSON (integer enums)
   │  scripts/sync-nis2-gap-assessment.ts   (operator-run, never automatic)
   │    fetch → translate ints→strings → stamp provenance → Zod-validate
   ▼
prisma/fixtures/nis2-gap-assessment.json    (PINNED snapshot, hermetic build)
   │  prisma/seed.ts  (idempotent upsert by id)
   ▼
Nis2GapDomain / Nis2GapQuestion   (GLOBAL reference — no tenantId, no RLS)
Nis2SelfAssessment / Nis2SelfAssessmentAnswer  (tenant-scoped — RLS + FORCE)
   │  Nis2GapAssessmentRepository  (every tenant query filters by tenantId)
```

Enum-shaped columns (`criticality`/`respondent`/`consequence`/`timeToFix`/
`answer`/`status`) are stored as **String**, validated at ingest by the Zod
string enums — the codebase never deals with the upstream integer codes
(`criticality: 3`). The translation lives in one place (the sync script),
keyed off the index→string maps exported from the Zod module.

## Files

| File | Role |
|------|------|
| `prisma/fixtures/nis2-gap-assessment.json` | pinned vendored data (translated, provenance-stamped) |
| `prisma/fixtures/nis2-gap-assessment.LICENSE.md` | CC BY 4.0 attribution sidecar |
| `scripts/sync-nis2-gap-assessment.ts` | operator re-sync (fetch + translate + validate + write) |
| `src/lib/schemas/nis2-gap-assessment.ts` | Zod schema + string-enum + index→string maps |
| `prisma/schema/compliance.prisma` | 4 new models (2 reference, 2 tenant) |
| `prisma/schema/auth.prisma` | Tenant back-relations |
| `prisma/migrations/20260626140000_add_nis2_gap_assessment/` | tables + indexes + FKs + RLS |
| `prisma/seed.ts` | idempotent gap-assessment seed block (separate from framework) |
| `src/app-layer/repositories/Nis2GapAssessmentRepository.ts` | reference reads + tenant CRUD |
| `src/lib/security/encrypted-fields.ts` | `Nis2SelfAssessmentAnswer.note` encrypted |
| `tests/guardrails/nis2-gap-assessment-coverage.test.ts` | licensing + integrity + RLS ratchet |
| `tests/guardrails/schema-index-coverage.test.ts` | `LIST_QUERY_INDEXES` entries for the 2 tenant models |

## Decisions

- **`Nis2GapDomain.id Int`** keeps the upstream natural key (0–14); the
  question FK (`domainId`) references it directly so no id remapping
  happens at ingest. Question id is the upstream string (`gap-0-01`).
- **Bilingual text stored as `Json`** (`{en, de}`) — faithful to upstream,
  avoids a 4-column-per-text explosion; reference content, never
  user-supplied, so no sanitisation concern.
- **String enums, not Prisma enums** — mirrors the source's "string enum"
  intent, avoids enum-migration churn, and the Zod schema is the single
  validation gate.
- **`createdById` / `answeredById` are plain `String`** (no `User` FK) so
  the assessment is independent of user-lifecycle cascades and to avoid an
  extra FK index requirement.
- **Verified against a real Postgres** before relying on CI: full
  `migrate deploy`, `rls-coverage` (16 tests green with the new tables),
  the sync script (reproduces the fixture byte-for-byte), and the seed
  (separate "20 requirements" + "116 questions" lines).
