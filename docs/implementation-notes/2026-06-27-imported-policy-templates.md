# 2026-06-27 — Imported policy templates (CSV export → Markdown)

**Commit:** `<sha> feat(policies): import 26 security-policy templates (CSV export → clean Markdown)`

## Design

A user supplied 27 single-policy CSV exports from a GRC tool (one policy per file,
HTML body in the "Content Editor Text" column). The ask: a usable, **print-friendly**
template for each, matching the rest of the library.

The export HTML is messy — fake bullets via `<span style="font-size:12px">•</span>`,
block-wrapper `<b>` around whole paragraphs, `<br>` soup, empty `<p></p>`, and (in
one file) a truncated unclosed trailing `<span>`. Stored as raw HTML and run through
`sanitizeRichTextHtml` (which drops `style`/`span`) it would render as run-on text
with literal `•` characters — not print-friendly.

So the importer **converts HTML → clean Markdown**, so the templates flow through the
exact same markdown→styled→PDF pipeline as the existing (ciso-toolkit) policies.
`scripts/import-policy-templates.ts` parses the CSVs, converts headings / lists /
inline-bold, unwraps spans, strips residual + unclosed tags, decodes entities, and
rewrites fake bullets to `-` items. Output is the pinned fixture
`prisma/fixtures/policy-templates-imported.json` (the hermetic seed source).

## Files

| File | Role |
|------|------|
| `prisma/fixtures/imported-policies-src/*.csv` | Vendored source exports (27 files; no PII — contacts are group names, zero emails). |
| `scripts/import-policy-templates.ts` | CSV→Markdown generator + `htmlPolicyToMarkdown` (exported for the ratchet). Re-run after dropping a fresh export in. |
| `prisma/fixtures/policy-templates-imported.json` | 26 generated MARKDOWN templates (title, category, tags, externalRef slug). |
| `prisma/seed.ts` | Seeds the imported templates as global `PolicyTemplate`s. |
| `tests/guardrails/imported-policy-templates-coverage.test.ts` | Fixture + print-friendliness + seed + converter ratchet. |

## Decisions

- **Convert to Markdown, not store HTML.** Clean Markdown renders identically to the
  rest of the library and prints well; raw export HTML would not survive the
  rich-text sanitiser cleanly. The ratchet asserts every body is sanitiser-stable
  (`sanitizePolicyContent('MARKDOWN', body) === body`) and free of HTML/entity/bullet
  remnants.
- **Seed upserts by `externalRef` (a title slug) ONLY — never by title.** Two imported
  titles exactly match ciso-toolkit templates ("Information Security Policy",
  "Risk Management Policy"). Matching by title would clobber POL-01/POL-02; by
  externalRef they coexist (verified: both rows present, distinct sources). The two
  same-titled cards are an accepted minor UX overlap, not data loss.
- **No fabricated licence/attribution.** The export carried no upstream
  licence/attribution metadata and the content is generic security-policy
  boilerplate. The fixture records provenance as a vendored CSV export and stamps
  `source: 'imported'`; nothing is invented. (Contrast the ciso-toolkit import, which
  had a real MIT licence to honour.)
- **No framework mapping / review-cadence pre-fill.** These aren't in the Prompt-2
  framework-map fixture (so no "Maps to…" badge) and lack a "Document Control"
  section, so Prompt-3 cadence parsing yields null — the tenant sets the schedule.
  In scope was clean, usable, print-friendly templates; that is delivered.
