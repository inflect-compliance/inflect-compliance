# 2026-07-10 — Split `compliance.prisma` into domain files

**Commit:** _(pending)_ `refactor(schema): split compliance.prisma into 16 domain files`

## Design

`prisma/schema/compliance.prisma` had grown to **111 models** (~3,300 lines) —
the hottest merge-conflict and review-bottleneck file in the repo. Prisma's
`prismaSchemaFolder` mechanism already concatenates every `prisma/schema/*.prisma`
file into one datamodel (base/enums/auth/vendor/audit/automation/processes
already coexist), so the fix is a **pure reorganisation**: move each
`model X { … }` block, byte-identical, into a domain-cohesive file.

111 models → **16 files**, each a coherent relation cluster, none exceeding
~30 models (largest is `risk.prisma` at 24):

| File | Models | Cluster |
| --- | --- | --- |
| `controls.prisma` | 16 | Control + coverage joins/tasks/templates/tests/exceptions |
| `risk.prisma` | 24 | Risk + quant/analytics/reporting/treatment |
| `frameworks.prisma` | 12 | Framework refs, mappings, ISO clauses |
| `policy.prisma` | 7 | Policy + versions/approvals/links |
| `assets.prisma` | 7 | Asset + vuln/scanner chain + Asset↔Risk |
| `personnel.prisma` | 6 | Employee/Device/Training/BackgroundCheck/identity |
| `incidents.prisma` | 6 | Incident (NIS2 Art.23) + BIA |
| `ai-governance.prisma` | 6 | AI-gov assessment + EU AI Act registry |
| `tasks.prisma` | 5 | Task + owned children |
| `nis2.prisma` | 5 | NIS2 gap self-assessment |
| `evidence.prisma` | 3 | Evidence + FileRecord + reviews |
| `findings.prisma` | 3 | Finding + junctions |
| `questionnaire.prisma` | 3 | Inbound questionnaires + answer library |
| `trust-center.prisma` | 3 | Trust-center projection + gated docs |
| `agentic.prisma` | 3 | Agent-proposal queue + workflow engine |
| `analytics.prisma` | 2 | Dashboard snapshots |

`compliance.prisma` remains as an **empty stub** (a header comment pointing at
the split) so the many path references don't 404 and so nothing re-monolithises
by accident.

## Zero-drift proof

The move is byte-identical at the datamodel level:

```
prisma validate --schema prisma/schema           → valid
npm run db:generate                              → Generated Prisma Client (v7.8.0)
prisma migrate diff --from-schema <main pre-split> \
                    --to-schema   prisma/schema \
                    --exit-code                  → "No difference detected." (exit 0)
```

No migration is generated; the DB contract is unchanged.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/*.prisma` (16 new) | The moved model blocks, one cluster each |
| `prisma/schema/compliance.prisma` | Reduced to a pointer stub |
| `tests/**` (46 files) | Repointed `read('prisma/schema/compliance.prisma')` → `readPrismaSchema()` (whole-folder concatenation helper) |
| `prisma/schema/README.md`, `CLAUDE.md` | Schema-layout note updated with the new files + "which file does my model go in" table |

## Decisions

- **Grep-based schema tests migrated to `readPrismaSchema()`.** ~46 guard/guardrail
  tests read `compliance.prisma` directly and asserted `model X` presence. Rather
  than repoint each to a specific new file (brittle — a model's home may change),
  they now read the whole-folder concatenation via the existing
  `tests/helpers/prisma-schema.ts::readPrismaSchema()`. A model's assertion holds
  wherever it lives.
- **Ambiguous junctions placed with their aggregate root.** `RiskControl` /
  `ControlAsset` / `ControlRequirementLink` → `controls.prisma` (the control
  coverage register); `AssetRiskLink` → `assets.prisma` (asset-exposure side, and
  it keeps `risk.prisma` under 30); `FindingRisk` → `findings.prisma`;
  `AiSystemRequirementLink` → `ai-governance.prisma` (with its `AiSystem` parent).
- **Enums untouched.** All enums already live in `enums.prisma`; the split moved
  only `model` blocks (verified: zero `enum` blocks in `compliance.prisma`).
- **Stub kept, not deleted.** Deleting `compliance.prisma` would break the
  `prisma-schema-folder-coverage` REQUIRED_DOMAIN_FILES check and any external
  path reference; an empty stub costs nothing and documents the split at the
  old location.
