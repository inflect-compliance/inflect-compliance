# 2026-07-04 — i18n adoption ratchet

**Commit:** `<pending>` test(i18n): ratchet requiring new UI to go through next-intl

## Design

The GAP-19 completeness guard (`i18n-completeness.test.ts`) proves every
`en.json` key has a translated `bg.json` counterpart — but it only polices
strings that *already reached the catalog*. A brand-new page that hardcodes
`<h1>Dashboard</h1>` never reaches the catalog, so it renders English in every
locale and no guard noticed. This ratchet closes that upstream gap.

**Invariant:** every `.tsx` under `src/app/t/[tenantSlug]/(app)` that renders
user-facing text must adopt next-intl (`useTranslations` / `getTranslations`).

**Shape** — a file-level ratchet mirroring the `as any` ratchet, but as a *set*
of paths rather than a count (a set pins exactly which files are grandfathered,
so a migration can't be silently cancelled out by a new offender):

- `hasHardcodedUiText(src)` — regex heuristic. Fires on a JSX text node with a
  real (≥3-char lowercase) word, or a UI-text prop/object key
  (`title`/`placeholder`/`label`/`header`/…) whose value is a **string
  literal**. The `{t('key')}` form is in braces, never a quoted literal, so
  migrated code never matches.
- `UNMIGRATED_BASELINE` — the frozen set of 171 files that hardcode text today.
- FORWARD test: a text-bearing file that uses neither next-intl nor the baseline
  fails. Proven to fire against a scratch probe page.
- NO-STALE test: every baseline entry must still be un-migrated-with-text —
  migrating or deleting a file forces removing its entry in the same PR, so the
  set only shrinks.
- Self-test block: six cases pinning the detector (fires on text/props, ignores
  `{t()}`, acronyms, comments, `className`/`id`).

## Files

| File | Role |
|---|---|
| `tests/guardrails/i18n-adoption-ratchet.test.ts` | The ratchet + detector + self-test |
| `docs/i18n.md` | Enforcement section: documents the new guard alongside GAP-19 |

## Decisions

- **Adoption, not per-string completeness.** The guard requires a file to *use*
  next-intl, not that every literal is extracted. 15 partial migrations
  (assets/vendors/dashboard/…) already use next-intl yet keep a residual
  literal; chasing every straggler is the migration PRs' job. Enforcing
  adoption is the high-value, low-noise invariant — it stops *new* surfaces
  regressing while leaving the in-flight migration room to finish files
  incrementally.
- **Set, not count.** A count ratchet lets "migrate A, add un-migrated B" pass
  with the number flat. The set names each grandfathered file, and the no-stale
  test makes the debt monotonic and visible.
- **Scope `.tsx` only.** Shared label maps in `.ts` files (filter-defs,
  `*-options.ts` enum labels) stay out — the same follow-up boundary the
  vendors/assets PRs already documented. Widening scope later just means adding
  a second walk; the detector is already file-type-agnostic.
- **Regex, accepted blind spot.** Text reaching the DOM only via a variable or
  child component is invisible. That is fine: the goal is catching the common
  case (literal strings in JSX/props), which is what "new UI strings go through
  next-intl" means in day-to-day review.
