# 2026-05-14 — CSP request header bridge (PR #481)

**Commit:** `589307a9 fix(csp): set CSP value on request headers for Next.js auto-nonce`

## Background

Production donut chart rendered as a thin orange crescent only.
Browser console showed:

```
Loading the script '_next/static/chunks/18at7xtdx0uoz.js' violates the following
Content Security Policy directive: "script-src 'self' 'nonce-...' 'strict-dynamic'"
```

PR #480 had added an inline `<script nonce={nonce}>` bridge in
the root layout's `<head>` that set `window.__webpack_nonce__` so
the webpack chunk-loader would stamp the nonce on every script it
injects. The bridge alone did not fix the violation.

## Diagnosis

Next.js 16's React Server Components renderer extracts the nonce
from the REQUEST CSP header to stamp every server-rendered
`<script>` and `<link rel="preload">` tag. The extraction logic
sits at `node_modules/next/dist/server/app-render/app-render.js:167`:

```js
const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
const nonce = typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined;
```

Our middleware was setting CSP on the RESPONSE headers only —
browser-side enforcement. The request-side path that drives auto-
nonce had nothing to read, so React rendered every `<script>` and
preload tag without a nonce attribute, and `strict-dynamic` blocked
the chunks at preload + load time.

## Fix

`src/middleware.ts` now sets the SAME CSP header value on BOTH:

- Request headers (`requestHeaders.set(cspHeaderName, cspHeader)`)
  — drives Next.js's auto-nonce machinery at SSR time.
- Response headers (`res.headers.set(cspHeaderName, cspHeader)`)
  — browser-side CSP enforcement.

Both use the same `cspHeaderName` variable so report-only mode
stays consistent across the request/response.

Verified locally: every `<script>` and `<link rel="preload">` in
the rendered HTML carries the nonce. Both `NODE_ENV=development`
and `NODE_ENV=production` produce identical nonce-stamping.

## What this fix does NOT cover

PR #481 fixes server-rendered script tags. The fix should resolve
the dashboard donut bug in production. But the CI E2E suite was
red on main since ≥2026-05-12 (Test+Coverage red too), and #481's
E2E shows the same browser console error. The remaining failure
likely involves a SPECIFIC dynamic-load path that bypasses Next's
nonce stamping — possibly a `react-dom/server` streaming chunk-
import path, or a client-side `import()` that doesn't propagate the
caller's nonce.

The `__webpack_nonce__` bridge from PR #480 stays in place — it's
the documented webpack convention for chunk-loader nonce
propagation. Whether webpack reads `window.__webpack_nonce__`
vs `__webpack_require__.nc` directly is a separate question; the
bridge is cheap and defensive.

## Files

| File | Role |
|------|------|
| `src/middleware.ts` | Set CSP on request headers in addition to response headers |
| `tests/guards/csp-request-header-bridge.test.ts` | 4 invariants locking the request-header pattern |
| `tests/guards/csp-script-guardrails.test.ts` | Allowlist `app/layout.tsx` for the webpack-nonce bridge inline script |

## Decisions

- **Request + response CSP must match.** A request header in
  enforce mode + response header in report-only mode would produce
  undefined Next.js behaviour. Both must come from the same
  `cspHeaderName` variable. Locked by the
  `csp-request-header-bridge.test.ts` invariant.

- **Allowlisting `app/layout.tsx` for `dangerouslySetInnerHTML`
  is intentional.** The webpack-nonce bridge is per-request nonced,
  deterministic (no user input — just the nonce value, JSON-
  stringified for safe embedding), and load-bearing for any
  webpack-dispatched chunk loading path. The structural shape is
  separately locked by `csp-webpack-nonce-bridge.test.ts`.

- **Did NOT remove PR #480's bridge.** Even though the request-
  header fix is the load-bearing piece, the bridge stays as a
  defensive layer for any code path that still uses webpack's
  global. Cheap to keep, expensive to debug if removed.

## Open items

The CI E2E suite remains red. A future investigation should:

1. Capture the failing browser console error in a Playwright trace
   to see WHICH page and WHICH dynamic-import path triggers the
   violation.
2. Compare the actual `<script>` tag in the rendered HTML on the
   failing CI run vs the local nonce-stamped output.
3. If the failure is a turbopack runtime-specific path, file
   upstream — Next 16 + turbopack + strict-dynamic is a relatively
   new combination and the `__webpack_nonce__` convention may not
   apply.
