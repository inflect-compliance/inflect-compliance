# 2026-06-19 — Theme flash (FOUC) fix: cookie-backed SSR theme

**Commit:** `<sha> fix(theme): persist theme in a cookie and render data-theme server-side (no dark flash)`

## Problem

On refresh the page flickered **dark → light** for light-theme users. The
theme was persisted **only in `localStorage`**, which the server cannot read,
so the root layout always emitted `<html data-theme="dark">`. Preventing the
flash relied entirely on a blocking inline `<head>` script reading
`localStorage` and correcting `data-theme` before first paint.

That inline-script race is fragile in this app's environment:

- **Strict CSP** — `script-src 'strict-dynamic' 'nonce-…'`, no `unsafe-inline`.
  Any nonce/cache mismatch blocks the inline script outright.
- **Streaming SSR** (App Router) — the `<html data-theme="dark">` shell can
  paint before the correction lands.

When the script loses the race, the browser paints the SSR `dark` shell, then
`ThemeProvider`'s post-hydration `useEffect` flips to `light` → the flash.

## Fix

Make the theme **server-readable** so the first SSR byte is already correct —
no client script has to win a race.

1. **`ThemeProvider`** now mirrors the theme to a cookie (`inflect_theme`,
   `path=/`, 1-year `max-age`, `SameSite=Lax`, `Secure` on https) in addition to
   `localStorage`. `persistTheme()` writes both; the mount effect also writes it
   on a pure read, so localStorage-only users and first-visit
   `prefers-color-scheme` picks get migrated to the cookie. Read order is now
   **cookie → localStorage → system preference → dark**.
2. **Root layout** reads the cookie via `next/headers` `cookies()` and renders
   `<html data-theme={initialTheme}>`. `dark` is only the no-cookie
   (brand-new-visitor) fallback. The layout was already dynamic (`headers()`),
   so reading cookies changes nothing about caching.
3. The inline `<head>` script is kept as a **first-visit-only** belt-and-braces:
   it resolves cookie → localStorage → system preference, sets `data-theme`
   before paint, *and* writes the cookie so the next SSR is correct.

Net effect: a returning user never flashes (SSR is correct, CSP/cache/nonce
irrelevant). A brand-new visitor can flash at most **once** (before any cookie
exists); after the first paint the cookie is set and it never recurs — even if
the inline script is blocked entirely.

## Files

| File | Change |
| --- | --- |
| `src/components/theme/ThemeProvider.tsx` | `THEME_COOKIE` export + `persistTheme()` (cookie + localStorage); cookie-first read order; mount effect persists on read. |
| `src/app/layout.tsx` | Read `THEME_COOKIE` server-side → `data-theme={initialTheme}`; inline script now cookie-aware + writes the cookie. |
| `tests/guards/theme-flash-init.test.ts` | Restructured: primary (SSR-from-cookie) + secondary (inline script) assertions. |
| `tests/unit/theme-provider.test.ts` | Cookie-persistence + cookie-first-order + layout-seeds-from-cookie assertions. |

## Decisions

- **Cookie name `inflect_theme` ≠ localStorage key `inflect:theme`** — cookie
  names are RFC6265 tokens and cannot contain `:`.
- **Kept localStorage** as a back-compat mirror (existing readers, and the
  cookie-less migration path) rather than ripping it out.
- **Did not remove the inline script** — it still earns its place for the
  first-visit `prefers-color-scheme` pick and as defence if a cookie is somehow
  absent. It's no longer the *only* thing standing between the user and a flash.
- **`dark` stays the no-cookie default** — the app is dark-default
  (`:root` = dark in `tokens.css`); SSR can't read `prefers-color-scheme`.
