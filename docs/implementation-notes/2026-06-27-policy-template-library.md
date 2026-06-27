# 2026-06-27 — 15-policy ISMS template library (ciso-toolkit)

**Commit:** `<pending>` feat(policies): 15-policy ISMS template library (ciso-toolkit)

## What

Replaced the thin hand-written policy-template starter set with a complete
**15-policy ISMS baseline** (POL-00 … POL-14) imported from
[ciso-toolkit](https://github.com/D4d0/ciso-toolkit) (**MIT**), mapped to
ISO 27001 + NIS2. Content + seed only — into IC's existing
`PolicyTemplate` model + `createPolicyFromTemplate` flow.

## Content, not structure

IC's policy machinery (`PolicyTemplate`, `createPolicyFromTemplate`,
`sanitizePolicyContent`, the picker UI) is already superior to the
toolkit's scripts/workflows — none of that was ported. Only the **policy
prose** was vendored, normalised into IC's `PolicyTemplate` shape:

- stripped the YAML frontmatter (doc metadata; the prose body is the value);
- replaced toolkit-internal cross-file links (`[text](../standards-…)`)
  with plain text — a dead link in a tenant's adopted policy is worse than
  a plain reference; http(s) links kept;
- mapped each policy 1:1 to an IC `category` + framework `tags`
  (`iso27001,nis2,<domain>`). The substantive prose is unmodified.

## Licensing (MIT — load-bearing)

MIT requires the notice to travel with the content. Satisfied three ways:
the pinned fixture stamps `source`/`sourceVersion`/`sourceLicense` per
row; a `prisma/fixtures/policy-templates-ciso-toolkit.LICENSE.md` sidecar
carries the full MIT text + source URL + pinned commit; and the picker UI
renders **"Adapted from ciso-toolkit (MIT)"** on toolkit-sourced templates
(gated on the new `PolicyTemplate.source` column). Made load-bearing by
the ratchet.

## Schema

Added two nullable columns to `PolicyTemplate`: `source` (gates the UI
credit; NULL for hand-written templates) and `externalRef` (stable
upstream id `POL-XX`, for idempotent upsert). PolicyTemplate is a global
reference table — no RLS / no new model.

## Supersede vs keep

The seed loads the fixture and upserts **by `externalRef` OR title**
(idempotent + re-syncable). Two thin hand-written templates are
**superseded in place** by their rich toolkit equivalents (matched by
title): `Information Security Policy` (→ POL-01) and `Risk Management
Policy` (→ POL-02) — same title, content + `source` replaced, no
duplicate row. The other 13 are added new. All other hand-written
templates are untouched. (Verified against a real Postgres: 15
`source='ciso-toolkit'` rows, single title for each overlap, 38 total.)
The existing `policy-template-coverage.test.ts` ratchet still passes — the
inline array (its REQUIRED_TITLES + ≥25 count) is left intact.

## Deliberate re-sync

`scripts/sync-ciso-toolkit-policies.ts` re-fetches from the pinned commit,
re-normalises, and rewrites the fixture. It is an **operator action,
never automatic** — adopted policy content is compliance-load-bearing; a
silent auto-update could change a tenant's adopted policy text.

## Sanitisation

`createPolicyFromTemplate` already runs `sanitizePolicyContent` (Epic
C.5). All 15 bodies pass `sanitizePolicyContent('MARKDOWN', …)`
**unchanged** (no raw HTML; the ratchet asserts no content is silently
stripped on adoption).

## Files

| File | Role |
|------|------|
| `prisma/fixtures/policy-templates-ciso-toolkit.json` (+ `.LICENSE.md`) | pinned 15-policy fixture + MIT attribution |
| `scripts/sync-ciso-toolkit-policies.ts` | operator re-sync (fetch + normalise + write) |
| `prisma/schema/compliance.prisma` + migration | `PolicyTemplate.source` + `externalRef` |
| `prisma/seed.ts` | upsert the 15 from the fixture (supersede 2 overlaps) |
| `src/app/t/[tenantSlug]/(app)/policies/templates/page.tsx` | "Adapted from ciso-toolkit (MIT)" credit |
| `tests/guardrails/policy-template-library-coverage.test.ts` | fixture + licensing + sanitisation + seed + UI ratchet |

## What this is NOT

- Framework-requirement linkage (auto-PolicyControlLink) — Prompt 2.
- Structured-metadata extraction (review cadence, evidence-to-retain as
  fields) — Prompt 3.
- The toolkit's standards-procedures / strategic-docs / KPI content — IC
  has no entity to host those.
- Editing the policy machinery — it already exists; this is content + seed.
