# 2026-06-05 — Zod `jitless`: silence the strict-CSP `eval` console violation

**Commit:** `<sha>` fix(csp): disable Zod's eval JIT in the browser (jitless)

## Problem

Production reported a CSP `script-src` violation on every page:

```
Content-Security-Policy: blocked a JavaScript eval … Missing 'unsafe-eval'
```

The page worked (the report reproduced in a clean Incognito window, so it
wasn't a browser extension), but the console was spammed and a security
scanner would flag it.

## Root cause

Not a deployment / bundler problem. The deployed app is a **Turbopack**
build (Next 16's default bundler) served by `next start`; a local
Turbopack build reproduced it and a `--webpack` build carried the same
code, so it was bundler-independent — i.e. a dependency.

The dependency is **Zod v4** (`zod@4.4.3`), used in every client-side
form. Zod's `util.allowsEval` probes whether `eval` is available so it
can compile a faster validator:

```js
// zod/v4/core/util.js
export const allowsEval = cached(() => {
    if (globalConfig.jitless) return false;          // <- the escape hatch
    if (navigator?.userAgent?.includes("Cloudflare")) return false;
    try { new Function(""); return true; } catch { return false; }
});
```

Under our strict CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, **no
`unsafe-eval`** — see `src/lib/security/csp.ts`) the browser blocks AND
**reports** `new Function("")`, even though Zod catches the throw and
falls back. One report per page load (the probe is `cached()`).

## Fix

Zod ships the escape hatch for exactly this: `config({ jitless: true })`
skips the probe and always uses the interpreted validator. The flag lives
on a `globalThis.__zod_globalConfig` singleton.

`src/lib/zod-jitless.ts` sets it **browser-only** (`typeof window !==
'undefined'`) — the server keeps the faster JIT path since `new Function`
is fine there and there's no browser CSP. The module is imported for its
side effect from the two earliest client entry points so the flag is set
before the first parse (which is what lazily triggers the probe):

- `src/env.ts` — the client env validation parses at module load; this is
  the earliest parse, so the import sits at the very top.
- `src/app/providers.tsx` — the root client provider, belt-and-suspenders.

## Files

| File | Role |
| --- | --- |
| `src/lib/zod-jitless.ts` | Side-effect module; sets `z.config({ jitless: true })` in the browser. |
| `src/env.ts` | Imports the side effect before its own env parse. |
| `src/app/providers.tsx` | Imports the side effect at the client entry. |
| `tests/unit/zod-jitless.test.ts` | jsdom test: flag set + Zod still validates. |

## Decisions

- **Browser-only guard.** Disabling JIT server-side would needlessly slow
  the heavy API-route validation for no benefit (no CSP on the server).
- **Not a bundler switch.** Turbopack vs webpack was ruled out — the probe
  is in Zod, present under both. (A separate, non-breaking
  `script-src-elem` chunk-load report under Turbopack + `strict-dynamic`
  was left alone: cosmetic, and switching the prod bundler is disproportionate.)
- **No `unsafe-eval` relaxation.** The whole point of the strict CSP is to
  keep `eval` out; `jitless` removes the *need* to probe rather than
  permitting eval.
