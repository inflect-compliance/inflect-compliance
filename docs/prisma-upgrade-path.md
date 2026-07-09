# Prisma version policy & upgrade path

The repo pins the **entire Prisma family to one major** (currently **7**). This
is enforced by `tests/guardrails/prisma-major-pin.test.ts`, which fails CI if
`prisma`, `@prisma/client`, or `@prisma/adapter-pg` drift off the pinned major
or off each other.

## Why a single pinned major

Prisma spans the schema (`prisma/schema/`), the generated client, the pg
adapter, and every migration. A **split major** — even across two branches —
is a standing hazard: it stranded `claude/implement-login-O64VA` on Prisma 5
while `main` moved to 7, turning a small stale branch into an expensive,
high-risk reconcile (see
[branch-divergence-o64va-analysis.md](branch-divergence-o64va-analysis.md)).
Pinning + the branch-freshness nudge (`.github/workflows/branch-freshness.yml`)
together keep long-lived branches from silently forking the framework version.

## Current pin

| Package | Range |
| --- | --- |
| `prisma` | `^7.8.0` |
| `@prisma/client` | `^7.8.0` |
| `@prisma/adapter-pg` | `^7.8.0` |

`PINNED_MAJOR = 7` in `tests/guardrails/prisma-major-pin.test.ts` is the single
source of truth for the ratchet.

## Upgrading the major (the deliberate path)

An upgrade is a **SIGNIFICANT change** (see
[change-management-policy.md](change-management-policy.md)) — one PR, one
reviewer sign-off, a rollback plan. Steps:

1. Read the Prisma release notes for every major between the current and target
   (breaking changes stack). Note preview-feature renames — the schema folder
   uses `prismaSchemaFolder` (see `prisma/schema/README.md`).
2. In a **single PR**, bump all three packages in `package.json` to the new
   major and run `npm install` so the lockfile resolves together.
3. Bump `PINNED_MAJOR` in `tests/guardrails/prisma-major-pin.test.ts` in the
   **same PR** — the ratchet is intentionally coupled so a bump can't land
   without acknowledging the pin.
4. `npm run db:generate` — regenerate the client against the new engine.
5. `npm run typecheck` — the generated client's types change across majors;
   fix call sites.
6. Run the schema guardrails (`tests/guardrails/schema-index-coverage.test.ts`,
   `tests/guardrails/rls-coverage.test.ts`, and the multi-file parser
   `tests/helpers/prisma-schema-models.ts`) — a major can change schema-DSL
   parsing.
7. Prove **zero unintended migration drift**:
   `prisma migrate diff --from-schema-datamodel prisma/schema --to-schema-datamodel prisma/schema`
   reports no changes.
8. Update this table + the pin, and land behind the normal CI gates.

## Do NOT

- Do not bump `@prisma/client` without `prisma` (or vice-versa) — the ratchet's
  coherence check blocks it, because a client/engine major mismatch is a
  runtime failure class.
- Do not revive a branch that predates the current major by rebasing it across
  the boundary — cherry-pick the genuinely-unique work onto a fresh branch off
  `main` instead.
