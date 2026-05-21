# 2026-05-21 — Bound the JWT membership payload

**Commit:** `refactor(auth): cap JWT membership payload, defer over-cap to server gate`

## Design

The NextAuth `jwt` callback embedded **every** active tenant + org
membership in the token (`token.memberships`, `token.orgMemberships`).
The JWT is a cookie-borne credential, not a data store — a user in
very many tenants grows the cookie without bound, eventually past the
~4 KB cookie limit. A latent overflow bug: fine for the 99.9% with a
handful of memberships, broken for a power user / MSP account.

The fix splits the concern by who reads what:

```
                    JWT (bounded, Edge fast-path)   server-side DB lookup
                    ─────────────────────────────   ─────────────────────
  Edge middleware   token.memberships (≤ cap)        —
  /tenants picker   —                                full membership query
  tenant switcher   session.user.memberships (≤cap)  —  (capped is plenty
                                                         for a dropdown)
```

- **Cap** — `MAX_JWT_MEMBERSHIPS = 50`. Both arrays are `.slice`d to
  the cap in the `jwt` callback. 50 is a safety valve, far above any
  realistic human workspace count.
- **Truncation flag** — when the real count exceeds the cap,
  `membershipsTruncated` / `orgMembershipsTruncated` is set on the JWT.
- **Middleware defers on a capped miss** — `checkTenantAccess` /
  `checkOrgAccess` take the flag. A slug-miss against a *capped* list
  is no longer a definitive `cross_tenant` denial (the slug may be one
  of the memberships that did not fit) — the gate returns `allow` and
  lets the authoritative, DB-backed server gate (`TenantLayout` →
  `getTenantServerContext`, or `getTenantCtx` for API routes) decide.
  This is safe because the middleware gate has always been the
  early-rejection layer, never the sole authority (see the org-gate
  comment in `middleware.ts`).
- **`/tenants` picker queries the DB** — it is a server component with
  no Edge constraint, so it lists every workspace regardless of the
  JWT cap. This is the "what belongs server-side" half of the split.

## Compatibility

Sessions minted before this change carry the full (uncapped) array and
no truncation flag. `token.membershipsTruncated` reads as `undefined`
→ `=== true` is `false` → the middleware treats them exactly as
before (full list, miss = deny). The `jwt` callback only rebuilds
memberships at sign-in, so old sessions keep their old shape until
they naturally re-mint. Zero breakage, no migration step.

## Files

| File | Role |
|---|---|
| `src/auth.ts` | `MAX_JWT_MEMBERSHIPS` const; `jwt` callback caps both arrays + sets the truncation flags; JWT type augmentation gains the flags. |
| `src/lib/auth/guard.ts` | `checkTenantAccess` / `checkOrgAccess` take a `truncated` arg — a capped miss returns `allow` (defer). |
| `src/middleware.ts` | Passes `token.membershipsTruncated` / `orgMembershipsTruncated` into the gates. |
| `src/app/tenants/page.tsx` | Picker queries the complete membership list from the DB instead of reading the capped JWT. |
| `src/components/layout/tenant-switcher.tsx` | Docstring updated — reads the capped JWT list; escape hatch is the `/tenants` picker. |
| `tests/guardrails/jwt-membership-bound.test.ts` | Ratchet — fails CI if the cap is removed, bumped past a sane ceiling, or the flags are dropped. |
| `tests/unit/jwt-membership-truncation.test.ts` | Unit coverage of the truncated-miss gate behaviour. |

## Decisions

- **Cap, not "move it all out of the JWT".** The Edge middleware needs
  the membership slugs to authorize with no DB hit; that is the JWT's
  job. Moving memberships out entirely would force a DB hit per request
  in middleware (not possible on the Edge) or re-mint-on-switch
  machinery. Capping keeps the fast-path while bounding the cookie.
- **Defer-on-capped-miss, not redirect-to-resolver.** A capped miss
  cannot loop back through `/tenants` (still a miss → loop). Deferring
  to the server gate — which already runs and is authoritative — is the
  only non-looping, no-new-machinery option, and it is genuinely safe.
- **The switcher keeps the capped JWT list.** Adding a per-navigation
  DB query to feed the switcher the complete list was rejected — for
  ≤ 50-membership users (≈ everyone) the capped list IS complete, and
  the rare over-cap user has the `/tenants` picker (full DB list) one
  click away via "Manage workspaces".
- **Fat entry kept (`{slug, role, tenantId}`).** Slimming the entry
  was considered but skipped to keep the change low-risk and free of
  type churn — the cap is the bound; 50 entries is bounded.
