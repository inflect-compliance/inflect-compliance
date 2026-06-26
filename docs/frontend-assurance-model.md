# Frontend Assurance Model

**Status:** Active convention. Read this before adding a test that
<!-- docs-accuracy-allow: "roadmap" used generically for a planned UI item -->
"proves" a UI feature works, and before claiming a UI roadmap item is
done.

## Why this exists

<!-- docs-accuracy-allow: filename reference to a historical audit doc -->
`docs/roadmap-audit-2026-05-13.md` documented a failure mode three
separate times in one week: **the structural ratchet was green but the
feature did not actually work.** The flagship case — a sidebar nav
active-band where `from-[var(--bg-page)]!` was present in the
`className` string (so the structural scan passed) but the rendered
`background-image` was still the wrong brand-default ramp, because
Tailwind's `from-X!` utility only sets `--tw-gradient-from` and does
**not** override an arbitrary `before:bg-[...]` value.

The repo carries ~387 structural ratchet tests under `tests/guards/`
and `tests/guardrails/`. The overwhelming majority are string/AST
scans that assert a className or a symbol is **present** in source.
That is a useful, cheap check — but it is **not proof the feature
works**. A class can be present and inert. A class can be present and
overridden. A class can be present on the wrong element.

This document defines the four verification tiers, says plainly what
each one does and does not prove, and gives a repeatable rule so a
future contributor cannot mistake "structural ratchet passes" for
"feature verified".

## The four tiers

| Tier | Location | What it renders | What it proves | Cost |
|------|----------|-----------------|----------------|------|
| **1. Structural ratchet** | `tests/guards/`, `tests/guardrails/` | Nothing — scans source text/AST | A class string or symbol is **present in source** | Cheap (ms) |
| **2. Rendered / behavioural** | `tests/rendered/` | The component, in jsdom | The **rendered DOM / computed/resolved value** is correct | Medium |
| **3. Integration** | `tests/integration/`, `tests/rendered/*-integration*` | Multiple components + data flow | Components **wire together** correctly | Medium–high |
| **4. Browser / E2E** | `tests/e2e/` | The real app in a real browser (Playwright) | The **full user flow works** with a real layout + CSS engine | High (minutes) |

### Tier 1 — Structural ratchet

A regular Jest test that reads source files with regex/AST and asserts
a pattern. Examples: "no `as any`", "every list page imports
`<DataTable>`", "the `NAV_ITEM_ACTIVE` const contains
`before:opacity-100`".

**Right for:** pure presence/absence checks — a banned token is gone, a
required import exists, a budget count did not regress, an exported
const is non-empty.

**Does NOT prove:** that the class has any rendered effect, that it is
not overridden by another rule, that it lands on the right element, or
that the wire-up between the class and the visible result holds. A
green Tier-1 test is **necessary but not sufficient** for any feature
with an observable runtime effect.

### Tier 2 — Rendered / behavioural test

Mounts the component in jsdom with `@testing-library/react` and
asserts the **rendered/computed/resolved outcome** — not just that a
className string contains a token.

**Right for:** primitives where the wire-up between className and
rendered effect is subtle and a Tier-1 scan would miss a regression.
The nav active-band is the canonical case: the class string can carry
the right token while the *rendered* gradient is wrong.

**The behavioural assertion rule.** A Tier-2 test MUST assert one of:

- a **computed style** via `getComputedStyle(el)` on a real element
  (jsdom resolves class-based rules from an injected `<style>`);
- a **resolved CSS custom property** via
  `getComputedStyle(documentElement).getPropertyValue('--token')`
  (jsdom resolves these);
- an **inline `style`** value the component actually wrote
  (`el.style.backgroundColor`, `el.style.animationDelay`);
- **rendered DOM structure** — which element exists, which element a
  class lands on, which cells carry it, what text content renders,
  what `role`/`aria-*` is present, what an event handler does.

A Tier-2 test MUST NOT consist solely of
`expect(el.className).toContain('some-class')`. That is a Tier-1 check
wearing a Tier-2 costume — it renders the component but verifies
nothing the component *does*. If the only thing you can assert is a
className substring, the structural ratchet already covers it; don't
duplicate it in `tests/rendered/`.

**jsdom limitations you must design around** (verified 2026-05-22):

- jsdom **resolves** class-based computed styles for *regular*
  properties (`.box { color: red }` → `getComputedStyle(el).color`
  is `rgb(255,0,0)`).
- jsdom does **NOT** substitute `var(--x)` — `getComputedStyle` returns
  the literal `var(--x)` string. Resolve the variable yourself via
  `getPropertyValue` on `:root` and compare.
- jsdom does **NOT** compute pseudo-element styles —
  `getComputedStyle(el, '::before')` returns empty strings. A
  `::before`-based effect cannot be verified by reading its computed
  background in jsdom. Verify it instead by (a) resolving the *token
  the class points at* against the real theme stylesheet and asserting
  it is the right value and not the wrong one, or (b) moving the
  assertion to Tier 4 (a real browser computes pseudo-elements).
- jsdom has **no layout** — `getBoundingClientRect` is all zeros;
  virtualization tests must pass explicit container heights.

The audit's original sketch
(`getComputedStyle(link, '::before').backgroundImage`) is therefore
**aspirational** — it does not work in jsdom. The behavioural nav-band
test in this PR achieves the same *intent* (catch the v1 failure where
the brand ramp survived in the rendered band) by resolving the band's
arbitrary-value tokens against the real `tokens.css` theme blocks and
asserting the active band resolves to `--bg-page` with **zero**
brand-ramp tokens.

### Tier 3 — Integration test

Mounts more than one component, or a component plus its data flow, and
asserts they cooperate: optimistic update + server reconcile, a filter
toolbar driving a table, a wizard advancing steps.

**Right for:** behaviour that only emerges from composition. A
single-component Tier-2 test cannot catch a wiring bug between two
components.

### Tier 4 — Browser / E2E

Playwright drives the **real built app in a real browser** under
`tests/e2e/`. A real browser has a real CSS engine: it computes
pseudo-elements, substitutes `var()`, runs layout, applies the full
Tailwind-compiled stylesheet, and renders the actual page.

**Right for:** full user flows, anything that depends on real layout
or real CSS cascade (pseudo-elements, `var()` substitution,
responsive breakpoints), and "did this thing actually disappear from
every page" sweeps.

**Definition — "browser-verified".** A feature is *browser-verified*
when a Playwright test in `tests/e2e/` (or a recorded manual check
against a deployed build) loads the real page and asserts the
**observable result** — a computed style read in the browser, an
element's presence/absence, a navigation outcome, visible text. A
green structural ratchet is explicitly **NOT** browser-verified. A
green Tier-2 rendered test is *behaviour-verified in jsdom* but is
**not** browser-verified, because jsdom is not a browser — it cannot
see a pseudo-element regression or a `var()` cascade bug. When an
effect lives entirely in CSS the jsdom engine cannot model (a
`::before` gradient, a `var()`-driven theme swap, a media query),
Tier 4 is the only tier that can prove it.

## A green structural ratchet is not proof

State it plainly, because the audit shows it is easy to forget:

> A passing Tier-1 structural ratchet proves a string is in the
> source. It does **not** prove the feature works. Only Tier 2
> (rendered/computed) and Tier 4 (browser) verify *behaviour*.

When you ship a UI roadmap item, "the ratchet is green" is a <!-- docs-accuracy-allow: "roadmap" used generically for a planned UI item -->
completion criterion for the *structural* part only. If the item has
an observable runtime effect, it is not done until it also has a
Tier-2 rendered test **or** a Tier-4 browser test — see the decision
tree below.

## Decision tree — which tier do I need?

```
Does the change have an observable runtime effect (visual / behavioural)?
│
├─ NO  → Tier 1 only.
│        (banned token removed, import added, budget held, dead-code
│         pruned, exported-const rename.)
│
└─ YES → Tier 1 (keep the cheap scan) PLUS at least one of:
         │
         ├─ Effect is a regular CSS property, DOM structure, text,
         │  role/aria, or an event handler outcome
         │      → Tier 2 rendered/behavioural test.
         │
         ├─ Effect only emerges from >1 component or a data round-trip
         │      → Tier 3 integration test.
         │
         └─ Effect lives in CSS jsdom cannot model (::before/::after,
            var() substitution, media queries, real layout), OR is a
            full multi-page user flow, OR is a "did X disappear
            everywhere" sweep
                → Tier 4 Playwright E2E.
```

## Convention — structure ≠ verified

Two lightweight, repeatable mechanisms keep "ratchet green" from being
mistaken for "feature verified". Neither depends on memory.

### 1. The behavioural-coverage registry

`tests/guards/behavioural-coverage-registry.test.ts` carries a curated
list of **high-risk primitives** — primitives where a structural
ratchet alone has been shown (or is judged likely) to miss a real
regression. For every entry the guard asserts a matching Tier-2
rendered test file exists under `tests/rendered/`.

The registry is a **one-way ratchet**: it starts with today's reality
and only grows. Removing an entry, or pointing it at a deleted test,
fails CI. A future contributor who adds a high-risk primitive adds a
registry row in the same PR — the guard then forces the rendered test
to exist before the PR can merge.

This is *not* an attempt to back-fill all ~387 ratchets — the audit
itself says "convert one ratchet per session". The registry is the
curated subset where the structural-vs-rendered gap actually bites.

### 2. The PR checklist

Every PR that ships UI-visible work answers, in the PR body:

- [ ] Does this change have an observable runtime effect?
- [ ] If yes — which tier verifies the *behaviour* (not just the class
      string)? Link the Tier-2 / Tier-3 / Tier-4 test.
- [ ] If the effect lives in a `::before`/`::after` pseudo-element,
      `var()` cascade, or media query — is it Tier-4 verified, or is
      the jsdom limitation explicitly noted?

"Structural ratchet added" on its own is **not** a sufficient answer
for a runtime-effecting change.

## What this PR covered (worked example)

The audit's "Known broken / risky areas (start here)" list has eight
prioritised items. This PR added Tier-2 behavioural tests for the four
that are amenable to rendered testing, and recorded where the other
four belong:

| Audit item | Tier chosen | Why |
|------------|-------------|-----|
| Nav active-band tone (#394) | Tier 2 — `nav-item-active-band-tone.test.tsx` | The band is a `::before` gradient; jsdom can't compute the pseudo, so the test resolves the band's arbitrary-value tokens against the real `tokens.css` and asserts `--bg-page` with zero brand-ramp tokens — the exact v1 failure. |
| Notifications bell (#432) | Tier 2 — `notifications-bell-behaviour.test.tsx` | Hover treatment is a class-based rule (jsdom resolves it); relative-time copy is a pure function whose *output text* is asserted — not `toLocaleDateString`. |
| DataTable row hover (#204/#374) | Tier 2 — `data-table-row-hover.test.tsx` | Asserts the hover/brand-edge classes land on the *correct cells* (leftmost cell) and only when the row is clickable — the exact #374 leak. |
| EmptyState cleared-filters CTA (#346) | Tier 2 — `empty-state-cleared-filters.test.tsx` | Renders the `no-results` variant, asserts the CTA *renders and fires*, and asserts the destructive/canonical vocabulary actually appears in the DOM. |
| Searchbar removals (#440/#443) | Tier 4 | "Did the search input disappear from every list page" is a multi-page sweep — only a real-app crawl proves the negative. Belongs in `tests/e2e/`. |
| Tenant switcher (#428) | Tier 4 | Depends on real JWT/session wiring and a popover in a real browser; `tests/e2e/` is the right home. |
| FilterToolbar coverage (#301) | Tier 1 + Tier 4 | The coverage *registry* is correctly Tier 1; "the toolbar still mounts on every page" is a Tier-4 sweep. |
| EntityDetailLayout coverage (#306/#310) | Tier 1 + Tier 4 | Same shape as FilterToolbar. |

## Related docs

<!-- docs-accuracy-allow: filename reference to a historical audit doc -->
- `docs/roadmap-audit-2026-05-13.md` — the audit that motivated this
  model; "Known broken / risky areas" is the prioritised gap list.
- `docs/design-system.md` — the primitive-by-intent index.
- `tests/guards/behavioural-coverage-registry.test.ts` — the
  one-way-ratchet registry described above.
</content>
</invoke>
