# 2026-07-01 — SOC 2 / vendor-document auto-parsing → assessment pre-fill

**Commit:** `<pending> feat(vendor): SOC 2 / document auto-parsing → assessment pre-fill`

## Why

Assessing a vendor today means sending a 100-question questionnaire and
waiting weeks. Instead: the vendor's SOC 2 Type II (or ISO cert / pen-test)
is parsed, AI-extracted, mapped to the assessment's questions, and used to
**pre-fill PROPOSED answers a human reviews** — weeks → minutes. This is
where Vanta/Drata's vendor AI is heading.

## Design — propose-not-commit, cited, sanitized

```
  VendorDocument (SOC 2 PDF)
      │  getFileRecordText → pdf-parse → raw text
      ▼
  sanitizeDocText  (strip control chars, REDACT email/phone, cap length)   ← privacy boundary
      ▼
  extractDocument  (OpenRouter → JSON → DocExtractionSchema.safeParse)      ← Zod shape+value; stub fallback
      ▼
  VendorDocExtraction (session)   +   map controls→questions (curated)
      ▼
  VendorAnswerProposal[]  (PENDING, each with a source CITATION)            ← NOT a scored answer
      │  human reviews
      ▼
  approveProposal → VendorAssessmentAnswer  (the ONLY commit path)
```

Mirrors the `RiskSuggestionSession`/`RiskSuggestionItem` propose pattern:
an extraction "session" + per-question proposals, where **acceptance
materialises the real entity** (`createdAnswerId`).

### The four safety properties (all ratcheted)
1. **Zod-validated extraction** — the model output is `safeParse`d against
   `DocExtractionSchema` (shape AND value); malformed → an empty `OTHER`
   extraction, never a throw or a raw cast.
2. **Propose-not-commit** — `extractVendorDocument` writes only
   `VendorAnswerProposal` rows; it NEVER writes a `VendorAssessmentAnswer`.
   Only the human-triggered `approveProposal` materialises an answer. An AI
   mis-reading a SOC 2 into a scored compliance record is a real risk.
3. **Source citation on every proposal** — e.g. `"SOC 2 CC6.1 — no
   exceptions, period 2025-06..2026-05"` — so a reviewer verifies the AI
   didn't hallucinate.
4. **Sanitize before the AI call** — the raw document text is redacted +
   capped before it ever reaches the model.

### Exceptions → findings (opt-in, idempotent)
A qualified control / exception can (explicit `materializeExceptions`)
propose a vendor `Finding` (`sourceKind='VENDOR_DOC_EXCEPTION'`,
`sourceRef=<extraction>:<control>`), deduped against existing ones.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/vendor.prisma` | `VendorDocExtraction` + `VendorAnswerProposal` (RLS, indexes) |
| `prisma/migrations/20260701140000_vendor_doc_extraction/` | tables + FKs + RLS |
| `src/app-layer/ai/vendor-doc/index.ts` | `DocExtractionSchema` + `sanitizeDocText` + `extractDocument` (OpenRouter→stub) |
| `src/app-layer/services/vendor-doc-text.ts` | PDF/text extraction from a stored file (pdf-parse) |
| `src/app-layer/services/soc2-question-map.ts` | curated SOC 2 control → question mapping |
| `src/app-layer/usecases/vendor-doc-extraction.ts` | orchestrator + approve/reject + exceptions→finding |
| `src/app/api/t/[tenantSlug]/vendors/[vendorId]/documents/[documentId]/extract/route.ts` | extract |
| `src/app/api/t/[tenantSlug]/vendor-extractions/[id]/route.ts` | review data |
| `src/app/api/t/[tenantSlug]/vendor-proposals/[id]/{approve,reject}/route.ts` | approve / reject |
| `tests/guardrails/vendor-doc-parse-coverage.test.ts` | structural ratchet |

## Decisions

- **`pdf-parse` (imported via `pdf-parse/lib/pdf-parse.js`)** — pure-JS, 0
  prod-dep advisories; the `/lib/` entrypoint dodges the package index's
  debug-harness. The PDF plumbing is isolated in one service so it's
  swappable; the usecase also accepts a `text` override (tests / already-
  extracted text).
- **Legacy `QuestionnaireQuestion` mapping** — proposals map against the
  assessment's legacy template questions (what `VendorAssessmentAnswer`
  references). G-3 template-version pre-fill is a follow-up.
- **No proprietary score** — the mapping is transparent, keyword-based
  reference data; every proposal is cited and human-reviewed.

## Follow-up (PR-2, UI)

The document-upload → extract trigger + the assessment review surface
(proposed answers rendered with citations + confidence; approve / edit /
reject; freshness flag when the SOC 2 period is expired).
