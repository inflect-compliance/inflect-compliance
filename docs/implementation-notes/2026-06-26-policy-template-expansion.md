# 2026-06-26 — Policy-template starter set expansion

**Commit:** `<pending>` feat(policies): expand global policy-template starter set (13 new domains)

## What

Expanded the global policy-template starter set seeded into the
`PolicyTemplate` model from 12 to 25, adding 13 new domains: asset
management, vulnerability management, secure development (SDLC), data
protection & encryption, mobile/BYOD, privacy, threat intelligence,
security governance, data retention & disposal, breach notification,
compliance & audit, policy management, and cloud security.

## The licensing decision (load-bearing)

The request was to import JupiterOne's `security-policy-templates`. That
repo is **CC-BY-SA-4.0** — copyleft with attribution AND ShareAlike. The
operator chose **not** to import it verbatim, because:

- ShareAlike would attach a copyleft obligation to customers' adapted
  policies — undesirable for a commercial compliance product.
- It contradicts the codebase's deliberate "ORIGINAL content. NOT ISO/IEC
  standard text" stance (`src/data/policy-templates.ts` header).

So JupiterOne's **domain list was used only as a subject checklist**. All
template text here is **independent original content** — no text was
copied. The ratchet
`tests/guardrails/policy-template-coverage.test.ts` enforces this: it
fails if any of JupiterOne's Mustache placeholders (`{{companyShortName}}`,
`{{defaultRevision}}`, `{{#needStandard…}}`, …) ever appears in the seed.

## Where templates actually live (gotcha)

Two policy-template definitions exist; only one is live:

- **`prisma/seed.ts` → inline `policyTemplates` array** (shape
  `{title, category, tags, contentText}`) → seeded into the
  `PolicyTemplate` model (idempotent: `findFirst` by title, skip if
  present). **This is the live path** — `listPolicyTemplates` reads the DB
  model via `PolicyTemplateRepository`. New templates were added here.
- `src/data/policy-templates.ts` (`POLICY_TEMPLATES`, shape
  `{title, content}`) is **dead code** — not imported anywhere. Left
  untouched; flagging it as a cleanup candidate.

New templates appear on the next `npm run db:seed` (idempotent, so
re-seeding existing tenants adds only the missing ones).

## Files

| File | Role |
|------|------|
| `prisma/seed.ts` | +13 original policy templates in the seeded array |
| `tests/guardrails/policy-template-coverage.test.ts` | coverage + no-verbatim-copy ratchet |
