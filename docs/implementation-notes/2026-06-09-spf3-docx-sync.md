# 2026-06-09 — Word (.docx) policy sync (SP-F3)

**Commit:** `<sha>` feat(integrations): DOCX policy sync (pull-authoritative) (SP-F3)

Closes the SP-4 "DOCX policy sync" deferral — with a deliberate scope.

## Design: pull-authoritative, not lossy bidirectional

Word documents are rich; IC's policy content (markdown/HTML) cannot faithfully
round-trip Word formatting. So **Word-linked policies are SharePoint-authoritative**:

- **Pull (Word → IC)** — when the linked SharePoint item is a `.docx`, the
  downloaded bytes are converted to HTML via **mammoth**, sanitised (Epic-C
  allowlist), and stored as an **HTML** policy version (`changeSummary: "Synced
  from SharePoint (Word)"`). Non-Word files pull as markdown text (SP-4 behaviour).
- **Push (IC → Word)** — **disabled** for Word-linked policies. Writing IC's
  markdown bytes into a `.docx` would corrupt the document, so `publishPolicy`'s
  push is a no-op for them (logged). Markdown-linked policies stay fully
  bidirectional.

The direction is driven by the **linked file's type** (`isDocxItem` by
name/mime) — no config column needed.

## Decisions

- **mammoth only (1 dep, BSD-2, 0 production vulns)** rather than a 3-dep
  bidirectional stack (`marked` + `html-to-docx` + `mammoth`). A markdown→DOCX
  round-trip is lossy and would expand the dependency-vuln surface; pull-
  authoritative is both safer and the correct model for rich Word docs.
- **Push-disabled, not push-as-markdown** — silently turning a `.docx` into a
  markdown blob would destroy the auditor's document. Skipping (with a log) is
  the safe failure.
- Converted HTML is sanitised in `docxToPolicyHtml` AND again by
  `createPolicyVersion` — defence in depth.

## Follow-up (documented, not built)

Full IC→Word push (markdown→DOCX) remains a deliberate non-goal; revisit only if
a customer needs IC-authored policies written back into Word format.

## Files

| File | Role |
| --- | --- |
| `providers/sharepoint/docx.ts` | `isDocxItem` + `docxToPolicyHtml` (mammoth + sanitise). |
| `usecases/policy-sharepoint-sync.ts` | pull→HTML for Word; push skip for Word. |
| `package.json` | `mammoth` dependency. |
