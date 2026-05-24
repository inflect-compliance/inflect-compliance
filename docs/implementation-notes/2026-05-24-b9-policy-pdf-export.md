# 2026-05-24 — B9 policy PDF export

**Commit:** `<sha> feat(b9): policy template upgrade — branded PDF export`

## Design

B9 of the 10-bundle 26-item roadmap. The roadmap item asks for
"logo · front page · clickable TOC · page breaks · classification
block" on the policy document. Delivered as a dedicated PDF export
endpoint with its own layout module, reusing the shared
PDFKit primitives.

The export composes:

```
┌──────────────────────────────────────────────────┐
│ Cover page  ── navy band + brand wordmark        │
│              + policy title + category subtitle  │
│              + classification chip               │
│              + provenance row (version, dates)   │
├──────────────────────────────────────────────────┤  ← addPage
│ Table of Contents                                │
│   1. Purpose            ───────── (clickable)    │
│   2. Scope              ───────── (clickable)    │
│   3. Roles & Responsib. ───────── (clickable)    │
│   ...                                            │
├──────────────────────────────────────────────────┤  ← addPage
│ Section 1: Purpose                               │
│   <body paragraphs>                              │
├──────────────────────────────────────────────────┤  ← addPage
│ Section 2: Scope                                 │
│   ...                                            │
└──────────────────────────────────────────────────┘
   ← per-page header/footer applied via the shared
     applyHeadersAndFooters stamping pass
```

`addNamedDestination(destName)` runs at the top of each section;
the TOC rows carry `goTo: destName` on their text options so
clicking a TOC row jumps inside the document.

## Files

| File | Role |
| --- | --- |
| `src/lib/pdf/policyLayout.ts` | Cover + TOC + section-title + body helpers; `PolicyClassification` type + `CLASSIFICATION_LABEL` map |
| `src/app-layer/reports/pdf/policyDocument.ts` | The generator — parses Markdown sections, composes cover → TOC → body, runs the shared stamping pass |
| `src/app/api/t/[tenantSlug]/policies/[id]/export/route.ts` | `GET` → streams the PDF, gates on `PDF_EXPORTS`, logs `POLICY_EXPORTED` |
| `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` | "Export PDF" anchor in the page-header actions slot |
| `tests/unit/policy-pdf-smoke.test.ts` | End-to-end smoke — generates a real PDF, asserts the magic bytes + size + EOF marker |
| `tests/guardrails/b9-policy-template-upgrade.test.ts` | 19 structural assertions across primitive + generator + route + UI |

## Decisions

* **"Logo" is a text wordmark, not an image asset.** The existing
  PDF pages render their brand entirely through PDFKit colour +
  font primitives (no embedded images). Adding an image upload
  pipeline (`Tenant.logoUrl` + storage abstraction + image
  fetching inside the PDF generator) is its own roadmap. The text
  wordmark (`● Inflect` lockup on the cover navy band) keeps the
  surface zero-asset while still reading as "this is branded".

* **Classification is per-export, not per-policy.** The route
  accepts a `?classification=` query string; the policy record
  doesn't carry a classification column. A persisted field would
  be a schema change AND a UI surface AND a default-policy debate
  — out of B9 scope. The query-string route satisfies the
  roadmap's "classification block" requirement with zero schema
  impact and lets future PRs upgrade to a persisted field by
  changing only the route's default lookup.

* **TOC sections come from the Markdown body's `# Heading` lines.**
  No new schema, no new editor UI — every policy currently in the
  product already carries `# Heading` markers in its seeded
  template content. A future content-builder can replace
  `parseSections` with a richer parser; the contract stays the
  same.

* **`goTo:` lives on `TextOptions`, not on a `link:` object.** Was
  briefly wrong in v1; the typecheck caught it (`Type '{ goTo:
  string; }' is not assignable to type 'string'`). Internal-document
  links are first-class on PDFKit's `TextOptions`; the test now
  positively asserts the right shape so a future refactor cannot
  silently regress to the `link: { goTo }` form (which compiles in
  some pdfkit versions but does NOT render an active link annotation
  in the output).

* **Cover uses `height:` cell-lock on the chip label.** Same
  load-bearing concern as the audit-readiness/SoA fix
  (`pdf-stamp-height-pinning`): the chip label is a second `text()`
  write on the same Y position; without `height:` the cursor
  drifts past the bottom margin on long classifications and
  triggers the trailing-blank-page cascade. Ratchet asserts the
  cell-lock is present.
