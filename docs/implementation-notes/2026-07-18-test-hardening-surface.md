# 2026-07-18 — Test hardening: real evidence integrity + surfaced features + polish (PR-R)

**Commit:** `<pending> feat(tests): real evidence integrity (hash on link + verify that can fail), surface export/snapshot/verify UI, localize badges, delete dead effectiveness wrapper (Prompt 3)`

## Design

The "test-hardening" chapter (evidence hashing, integrity verify, run snapshot,
evidence export) was built but decorative or unsurfaced. Three fixes.

### 1. Make evidence integrity real (decision: **wire it**, not remove)

`ControlTestEvidenceLink.sha256Hash` was never populated: `linkEvidenceToRun`
didn't hash, and the standalone `linkEvidenceWithHash` was dead AND broken (it
passed a `FileRecord.id` where `verifyFileIntegrity` wants a storage `pathKey`).
`verifyRunEvidence` treated a null stored hash as `matches:null` → `integrityOk`
was trivially true.

- **Hash on link.** `linkEvidenceToRun` now, for `kind:'FILE'`, freezes the hash
  from `FileRecord.sha256` (the trustworthy checksum computed at upload — a
  required, non-null column) onto the link. `TestEvidenceRepository.link` gained
  a `sha256Hash` param. The run page links an uploaded file as `kind:'FILE'` with
  its `fileId` (it previously always used `kind:'EVIDENCE'`, so no FILE link ever
  existed to hash).
- **Verify that can fail.** `verifyRunEvidence` now resolves the FileRecord's
  `pathKey`, recomputes the bytes from storage, and compares to the frozen link
  hash. A FILE link whose frozen hash can no longer be confirmed (tampered /
  file gone) → `matches:false` → `integrityOk:false`. A FILE link with no frozen
  hash (legacy) stays unverifiable (`null`), never a false alarm.
- **Removed** the dead, broken `linkEvidenceWithHash`; the live
  `linkEvidenceToRun` is the one hashing linker.
- **Surfaced** an integrity indicator on the run page (calls the verify-evidence
  route; a badge that can show "Integrity failed").

### 2. Surface the hardening features

`verify-evidence`, `snapshot` (→ audit pack), and `exportTestEvidenceBundle`
(CSV/JSON) had working routes but no UI. Added in-page affordances on the run
page: "Export evidence bundle" (CSV/JSON download), "Snapshot to audit pack"
(COMPLETED runs → a DRAFT pack), and the integrity indicator. No navbar change.

### 3. Polish

- **Localized** the raw-enum badges on `/tests` — plan status (`planStatus.*`) and
  last result (`result.*`) now use `t()`-backed label maps, matching the existing
  localized method/frequency/checkStatus pattern. `automationKey` stays verbatim
  (a technical provider identifier, not an enum — same as the Checks tab).
- **Deleted** the dead `getControlEffectiveness` wrapper (zero prod callers);
  `computeControlEffectivenessMap` is the live source of truth, called directly by
  control-roi / control/health / risk-residual-suggestion inside their own gated
  contexts. Guardrails retargeted to it.
- **Per-step verdict — decision: make the UI honest.** No per-run per-step result
  model exists (only plan-level `ControlTestStep` templates + the aggregate
  `ControlTestRun.result`); the run-page per-step checkboxes were client-only
  ephemeral state. Adding a per-step-result model + migration is out of proportion
  to the value, so the run checklist is now clearly labeled a guidance aid — only
  the aggregate result is recorded. The UI no longer implies per-step results are
  saved.

## Decisions

- **Wire, don't remove (integrity).** All the pieces existed and were correct once
  the hash source (FileRecord.sha256) and the verify path (pathKey) were fixed —
  removing would have thrown away a real, valuable feature.
- **One linker.** Folding hashing into `linkEvidenceToRun` and deleting the
  duplicate `linkEvidenceWithHash` avoids two divergent evidence linkers.
- **Honest UI over a new model (per-step).** Persisting per-step verdicts would
  need a new table, migration, RLS, and API — disproportionate for a checklist
  aid. Labeling it honestly is the right-sized fix; a real per-step model is a
  future item if audits ever require step-level attestation.
