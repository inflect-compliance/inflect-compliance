# 2026-06-30 — Evidence title: CSS truncation (not JS substring)

**Commit:** `<sha> fix(evidence): CSS-truncate title so full text stays in the DOM`

## The regression

The 6-item UI batch (#1337) truncated the Evidence list's title column to
20 chars by rendering `truncateGlyph(title, 20)` as the cell's children. That
**removed the full title from the DOM** — the visible text node became
`"Modal Evidence mr0o7…"`. The full value survived only in a hover `Tooltip`
(a portal, not in the row's `textContent`).

Consequence: the evidence-list E2E specs that create a row and assert its
**full** title appears went consistently red —
`core-flow.spec.ts:113` (`text=E2E Evidence <unique>`) and
`evidence-upload-modal.spec.ts:110` (`#evidence-table` `toContainText("Modal
Evidence <unique>")`). These were misread as the recurring "E2E flake" and a
test-only de-flake PR couldn't fix them — they were a **real product
regression**, not a timing flake.

## Fix

Render the raw `title` as the cell children and truncate **visually** with CSS:
`max-w-trunc-default truncate` (the semantic Roadmap-4 PR-6 token; an
arbitrary `max-w-[20ch]` is banned by `truncation-max-width-tokens`).
`text-overflow: ellipsis` is purely visual — `textContent` stays complete, so
the E2E assertions, screen readers, in-page search, and copy-paste all get the
full title; the hover tooltip still shows it too.

## The general lesson (locked)

**Never JS-substring a list cell's visible text.** A truncated text node breaks
any assertion (or a11y/search/copy) that reads the full value. Truncate with
CSS so the DOM keeps the real string. `tests/guards/evidence-title-full-text-in-dom.test.ts`
locks the evidence surface against re-introducing JS truncation; the same
principle applies to every list cell.

## Files

| File | Role |
|---|---|
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx` | Title cell → CSS truncation; dropped the `truncateGlyph` import. |
| `tests/guards/evidence-title-full-text-in-dom.test.ts` | Ratchet: no JS-truncation of the title; semantic CSS-truncation present. |
