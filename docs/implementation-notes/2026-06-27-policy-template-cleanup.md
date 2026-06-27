# 2026-06-27 — Policy-template cleanup (stub removal + imported canonical + dedup)

**Commit:** `<sha> chore(policies): remove stub templates, dedupe overlaps, map imported copies`

## Why

The global policy-template picker accumulated **thin one-paragraph "5-6 row"
stubs** (Access Control, Data Classification, Incident Response, Change
Management, etc. — 68–199 chars each) and **duplicate titles** (the imported
library overlaps the ciso-toolkit + expanded-starter sets on "Information
Security Policy", "Risk Management Policy", "Asset Management Policy", "Privacy
Policy", …). The stubs rendered as near-empty documents; the duplicates showed
two cards for the same policy.

## Changes

- **seed.ts:** removed the 12 inline starter stubs from the `policyTemplates`
  array and the redundant "Information Security Policy" flagship entry. The full
  versions of those topics come from the expanded-starter originals, the
  ciso-toolkit library, and the imported library.
- **Imported loop is now canonical:** it upserts by `externalRef` **OR `title`**
  (was externalRef-only), so an imported policy SUPERSEDES any earlier
  same-titled template instead of creating a duplicate card. Result on a fresh
  seed: 0 stubs, 0 duplicate titles (verified on a real DB).
- **Framework mapping carried over + extended to the whole imported set:** the
  imported `information-security-policy` and `risk-management-policy` mirror their
  ciso twins (POL-01 / POL-02); the remaining 24 imported policies are now mapped
  too (curated ISO 27001 Annex A + NIS2 requirements per policy domain) in
  `policy-template-framework-map.json`. Imported mappings are wholly `curated`
  (the imported export carries no toolkit/CSF provenance), so the
  "every policy has a from_toolkit mapping" ratchet is scoped to the ciso POL-xx
  set, and a new ratchet asserts every imported policy is mapped to ≥1
  requirement. All 26 imported → framework-aware suggestions.
- **Prod:** the live picker was already deduped/de-stubbed by a one-off
  templates-only DB prune (11 rows removed → 40). This PR makes the SOURCE match
  so a reseed stays clean; the imported-copy framework mappings activate on the
  next image deploy (the map is a bundled fixture, resolved at runtime).

## Ratchets touched

- `policy-template-coverage.test.ts` — dropped the 5 removed stub titles from
  `REQUIRED_TITLES` (those topics now come from fixtures, not inline originals).
- `policy-template-mapping-coverage.test.ts` — "15 POL" check is now a subset
  check + a new assertion that the imported overlaps mirror POL-01/POL-02.
- `imported-policy-templates-coverage.test.ts` — seed-match assertion updated to
  externalRef-OR-title (imported is canonical).
