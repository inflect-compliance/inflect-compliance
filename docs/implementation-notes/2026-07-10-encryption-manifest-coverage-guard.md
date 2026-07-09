# 2026-07-10 — Encryption-manifest coverage guard

**Commit:** `<sha>` test(security): make field-level encryption opt-out-with-justification

## Design

Field-level encryption (`ENCRYPTED_FIELDS` in
`src/lib/security/encrypted-fields.ts`) was **opt-in-by-memory**: a
column encrypts at rest only if a human remembered to add it to the
manifest. Nothing stopped a new sensitive column — say
`Finding.investigationNotes` — from shipping in plaintext because the
author never knew the manifest existed. The architecture review named
this the last opt-in-safety gap.

This closes it with a schema-driven ratchet that inverts the default to
**opt-out-with-justification**:

```
for every String / String? column on a TENANT_SCOPED model
    whose name matches SENSITIVITY_HEURISTIC
        (note|comment|description|summary|content|reason|answer|
         body|detail|finding|remediation|treatment):
    assert it is EITHER in ENCRYPTED_FIELDS
                OR in NOT_SENSITIVE (a written one-line reason)
```

A brand-new sensitive-shaped column that is neither fails CI. The author
must then make a conscious choice — encrypt it, or record why it stays
plaintext — instead of silently shipping plaintext.

The guard reuses the existing structured schema parser
(`tests/helpers/prisma-schema-models.ts`) and the canonical
`TENANT_SCOPED_MODELS` set (`@/lib/db/rls-middleware`) — the same
authorities the RLS and index guardrails already stand on, so it tracks
the live schema with zero new parsing surface.

Both lists are **seeded from the current schema**, so the guard lands
GREEN with zero behaviour change (no column's encryption status moved).
It bites only on *new* unclassified sensitive-shaped columns.

## Files

| File | Role |
|------|------|
| `tests/guardrails/encryption-manifest-coverage.test.ts` | The guard: heuristic scan + `NOT_SENSITIVE` allowlist + forward / no-stale / contradiction / self-tests. |
| `src/lib/security/encrypted-fields.ts` | Header updated to name the guard as the enforcement mechanism (both the manifest intro and the "Adding a new field" checklist). |

## Decisions

- **Name heuristic, not content analysis.** Cheap, deterministic, and
  matches the free-text column shapes this product actually ships. False
  positives (an enum column called `answer`, an FK called `findingId`)
  are absorbed by `NOT_SENSITIVE` with a one-line reason; genuinely
  sensitive columns with an off-pattern name (unlikely given house
  naming) would slip — widen the heuristic when a new shape appears.
- **`NOT_SENSITIVE` carries a written reason per entry**, and a no-stale
  test deletes an entry the moment its column is encrypted or removed —
  the same monotonic-ratchet shape as the `as any` and i18n-adoption
  guards. A contradiction test also fails if an entry is *both*
  allowlisted and encrypted.
- **Seeded, not enforced retroactively.** The currently-unclassified
  columns were triaged into `NOT_SENSITIVE`: heuristic false-positives
  (FKs, enum answer values), search-required plaintext (the documented
  `Risk.description` / `Policy.description` / `Evidence.content`
  carve-outs), admin config labels, derived/sanitised summaries, public
  Trust-Center content, transient outbox bodies, the append-only
  `AuditLog.details` (hash-chain integrity), and a set of honest
  **deferred candidates** (`RiskScenario.description`,
  `VendorAssessment.reviewerNotes`,
  `VendorAssessmentAnswer.reviewerNotes`, and the inbound-questionnaire
  answer columns) whose reasons say so. The guard keeps that deferral
  visible rather than silent — which is the whole point.
- **`TENANT_SCOPED_MODELS` reads `Prisma.dmmf`** (the generated client),
  not the schema text, so a stale local Prisma client hides new models.
  The guard's model list therefore only matches CI after
  `npx prisma generate` — a fresh-client run surfaced three
  questionnaire columns a stale local client had hidden.
- **Acceptance proven**: injecting `Finding.investigationNotes` into the
  schema fails the forward test with a clear message; reverting restores
  green. A self-test asserts the heuristic fires on the example shapes
  and ignores obvious non-content names, so a future refactor can't make
  the forward test vacuously pass.
