# 2026-06-19 — Theme flash, the REAL fix: server-safe theme constants

**Commit:** `<sha> fix(theme): move theme constants to a server-safe module (cookie SSR was a no-op)`

## Why the previous fix didn't work

The cookie-SSR fix (`2026-06-19-theme-flash-cookie-ssr.md`, PR #1131) was
**silently a no-op in production** — the page still flashed on every reload.

Root cause: the theme constants (`STORAGE_KEY`, `THEME_COOKIE`) were exported
from `src/components/theme/ThemeProvider.tsx`, which is a **`'use client'`**
module. The **server** root layout imported them. When a server component
imports a value from a `'use client'` module, Next.js replaces the export with
a **client-reference proxy** — so on the server `THEME_COOKIE` was a *function*,
not the string `'inflect_theme'`.

Consequences, both invisible (no error, no type failure):
- `(await cookies()).get(THEME_COOKIE)` → `cookies().get(<function>)` → always
  `undefined` → SSR always rendered `data-theme="dark"`.
- `JSON.stringify(THEME_STORAGE_KEY)` in the inline anti-FOUC script →
  `JSON.stringify(<function>)` → `undefined`, so the script ran
  `localStorage.getItem(undefined)` and never read the stored theme.

So **both** flash-prevention mechanisms were dead. Confirmed by instrumenting
the layout on a live dev server:
`THEME_DEBUG cookie_names=["inflect_theme"] theme=undefined THEME_COOKIE=undefined type=function`
— `cookies()` saw the cookie, but `THEME_COOKIE` wasn't the string.

## The fix

New `src/lib/theme-constants.ts` — **no `'use client'`** — owns the literal
values (`THEME_STORAGE_KEY`, `THEME_COOKIE`, `Theme`). The server layout imports
from there (real strings); `ThemeProvider` imports + re-exports them for its
client consumers. Verified on a live dev server:

```
cookie=none            -> data-theme="dark"
cookie=inflect_theme=light -> data-theme="light"   ← was "dark" before
cookie=inflect_theme=dark  -> data-theme="dark"
```

## Files

| File | Change |
| --- | --- |
| `src/lib/theme-constants.ts` | **New** server-safe module owning the literal theme constants. |
| `src/components/theme/ThemeProvider.tsx` | Import constants from the new module; re-export `STORAGE_KEY`/`THEME_COOKIE`/`Theme` for client consumers. |
| `src/app/layout.tsx` | Import `THEME_STORAGE_KEY`/`THEME_COOKIE`/`Theme` from `@/lib/theme-constants`, never from the client provider. |
| `tests/guards/theme-flash-init.test.ts` | New regression guard: constants live server-safe; layout imports them from there, NOT from the `'use client'` provider. |
| `tests/unit/theme-provider.test.ts` | Point constant-definition assertions at the new module. |

## Decisions

- **Constants in their own module, not redefined in the layout.** A literal in
  the layout would work but drift from the client's value; one shared
  server-safe module keeps a single source of truth that both sides import.
- **General lesson (now guarded):** never import a *value* from a `'use client'`
  module into a server component — only types (erased) or components (resolved
  as client references) survive the boundary. Plain constants silently become
  proxies. The regression guard in `theme-flash-init.test.ts` enforces it for
  the theme constants specifically.
