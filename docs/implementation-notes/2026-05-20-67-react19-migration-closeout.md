# 2026-05-20 — #67 — React 18 → 19 migration closeout

**Commit:** `<pending> chore(react19): close out #67 — verify migration, correct CLAUDE.md`

## Status: complete

Issue #67 tracked the deliberate React 18 → 19 migration deferred
from dependabot PRs #11 / #13. The migration has since landed — this
note records the closeout verification and corrects the stale
framework documentation.

## Verification against #67's prep checklist

| Checklist item | Finding |
|---|---|
| React 19 deps installed | ✅ `react` / `react-dom` `^19.2.5`, `@types/react` `^19.2.x`. The repo also moved to `next@16.2.6`. |
| Removed legacy APIs — `propTypes`, function-component `defaultProps`, string refs, legacy context | ✅ A tree scan of `src/` finds **zero** usages of any of them. Nothing to remove. |
| `forwardRef` audit | 31 files use `forwardRef`. React 19 did **not** remove it — it still works (R19 additionally allows `ref` as a plain prop). No call site relies on subtle ref-forwarding semantics that R19 changed; modernising them to the prop form is optional and out of scope. |
| Third-party dep compatibility (`@radix-ui/*`, `@tanstack/*`, `motion`, `next-auth`, `@tiptap/*`, `cmdk`, …) | ✅ All install cleanly and the full suite + E2E pass on `main` — every React-dependent dependency is React-19-compatible at the pinned versions. |
| Full test suite + E2E | ✅ Green on `main` with React 19 + Next 16. |
| `next.config.js` React-18-pinned settings | ✅ None. |

The migration's risk surface (the removed-API audit) came back
empty, and CI proves the app runs on React 19 / Next 16 — so #67 is
done. No code change was needed beyond what already landed.

## Files

| File | Change |
|---|---|
| `CLAUDE.md` | "Framework baseline" corrected: was `Next.js 15.5.15` / `React 18.3`; now `Next.js 16.2.6` / `React 19.2`. Added the React-19 removed-API note; reframed the async-`params` caveat (the repo is already on Next 16). |

## Follow-up (not #67)

The Next 16 `await params` migration — wrapped route handlers still
type `params` synchronously and lean on the `withApiErrorHandling`
transparent-await shim. Retiring the shim in favour of explicit
`await params` at every site is a separate, bounded follow-up,
tracked in the CLAUDE.md framework-baseline note.
