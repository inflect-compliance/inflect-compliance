#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  Inflect Compliance — Container Start    ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Apply Prisma migrations (idempotent) ──
#
# Pin the CLI version to match @prisma/client in package.json. If
# `prisma` is ever pruned from the image (e.g. someone moves it
# back to devDependencies), `npx prisma` would otherwise fetch
# `latest` from npm and could ship breaking changes silently.
#
# Prisma 7 — connection URLs are NOT in the schema any more (they
# moved to `prisma.config.ts` at the repo root). The CLI auto-
# discovers that config file from the cwd, so `--schema` here is
# redundant but kept for explicitness. The previous pin
# `prisma@5.22.0` rejects the Prisma 7 schema with
# "Argument 'url' is missing in data source block 'db'" — bumped
# to 7.8.0 in lockstep with the migration that landed in #140.
echo ""
echo "→ Applying database migrations..."
npx --yes prisma@7.8.0 migrate deploy --schema=./prisma/schema
echo "✓ Migrations applied"

# ── 1b. Seed self-assessment library content (idempotent) ──
#
# The NIS2 gap-assessment + AI-governance question sets live in global
# reference tables populated from fixtures, NOT by migrations. Migrations
# create the empty tables; without this step a fresh (or pre-existing, since
# these sets were added after the initial seed) production DB serves ZERO
# questions and the onboarding wizard's self-assessment steps render blank.
# The seeder is upsert-only + confined to those global tables, so it is safe
# to re-run on every start. Non-fatal: a seed hiccup must never block the app.
echo ""
echo "→ Seeding self-assessment library content..."
node dist/seed-self-assessments.mjs || echo "⚠ self-assessment seed skipped (non-fatal)"

# ── 1c. Seed the global policy-template library (idempotent) ──
#
# Same rationale as 1b: the global PolicyTemplate rows come from vendored
# fixtures via prisma/seed.ts (not run on prod deploys), so templates added to a
# fixture never reach an already-seeded env. Upsert-only over the global
# template fixtures — safe to re-run. Non-fatal.
echo ""
echo "→ Seeding policy-template library..."
node dist/seed-policy-templates.mjs || echo "⚠ policy-template seed skipped (non-fatal)"

# ── 2. Create upload directory if missing ──
FILE_DIR="${FILE_STORAGE_ROOT:-/data/uploads}"
mkdir -p "$FILE_DIR" 2>/dev/null || true
echo "✓ Upload directory ready: $FILE_DIR"

# ── 3. Start Next.js ──
echo ""
echo "→ Starting Next.js server on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
