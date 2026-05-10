# Typography tones — `text-content-*` token vocabulary

The product carries four content-tone tokens. Each has a single,
defined intent. Reaching for the wrong one drifts the visual
hierarchy and reads as inconsistent across surfaces.

## The four tokens

| Token | Tone | Intent |
|---|---|---|
| `text-content-emphasis` | 100% emphasis | Page titles (`<Heading level={1}>`), section titles (`<Heading level={2/3}>`), card titles, primary value text in metric tiles, the value half of a key-value row. |
| `text-content-default` | 90% emphasis | Body copy that is neither title nor secondary. Form-field current values, table-cell primary text, paragraph content. |
| `text-content-muted` | 70% emphasis | **Secondary** informational copy. `<Caption>` body, `<Eyebrow>` labels, helper text, descriptions below a title, count chips on rows ("47 risks"), inline metadata next to a primary value, list-row secondary lines. |
| `text-content-subtle` | 50% emphasis | **Tertiary** copy. Disabled labels, separator dots, "of N" pagination breakdowns, the `(N)` count next to a tab label, key fragments inside cell renderers, placeholder hints in already-rendered fields, footnotes that aren't load-bearing. |

## Concrete rules

### Use `text-content-muted` when

- The line is a *complete* secondary thought next to a primary one.
- `<Caption>` body copy renders with this tone (the primitive
  enforces it).
- A list-row's secondary line ("Created 2 days ago by Jane").
- A table-cell secondary value.
- The descriptive text below a `<Heading>` or page title.

### Use `text-content-subtle` when

- The line is *tertiary* — a footnote, a separator, a disabled label.
- `<Eyebrow>` labels (the primitive enforces it).
- Pagination text ("1-10 of 47") — the user reads the numbers,
  not the prose.
- Placeholder-style hints inside a populated input.
- "Last updated" timestamps that aren't the primary metadata of
  the card.

### Never use raw palette greys

`text-gray-*`, `text-slate-*`, `text-neutral-*` don't theme
through the dark↔light flip. Always reach for the semantic
tokens above. The `tests/guards/no-raw-palette-greys.test.ts`
ratchet enforces this in app code; primitives that legitimately
need precise raw values for shadow rendering are allowlisted.

## Why two muteds?

Premium products carry two quiet tones: one for "secondary
content the user is meant to read" and one for "tertiary
content the user is meant to scan past". Without the
distinction, the interface either reads as too quiet
(everything is text-subtle, nothing emphasizes) or too noisy
(everything is text-muted, the eye doesn't settle).

The 70% / 50% split (muted / subtle) is the right ratio: the
secondary line still reads clearly; the tertiary line recedes
into the background.

## Tab counts

The `(N)` count next to a tab label is `text-content-subtle
tabular-nums ml-1 text-xs`. Locked in Roadmap-4 PR-7.

## Eyebrows

`<Eyebrow>` renders with `text-content-muted` intrinsically
(Roadmap-4 PR-3 lock). Consumers do not override the tone.

## Captions

`<Caption>` renders with `text-content-muted` intrinsically.
Consumers do not override the tone.

## Caveats

- `text-content-default` is rarely the right choice — most body
  copy renders inside primitives that pick the right tone for
  their context. If you find yourself reaching for
  `text-content-default` on a page, the better answer is usually
  to use a primitive that owns the tone.

- `text-content-emphasis` is for *load-bearing* text — titles,
  values. Don't use it for paragraphs (that's `default`).
