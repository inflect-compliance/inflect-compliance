# 2026-07-09 — GAP-4: real Okta / Google identity enrichment

**Commit:** _(pending)_ `feat(integrations): real per-user Okta + Google identity signals`

## Design

The identity checks (`mfa_enforced`, `no_dormant_admins`,
`admin_count_within_threshold`, `sso_enforced`) evaluate per-account signals
on `NormalizedIdentityAccount`. Three of those signals were hardcoded `null`
because the directory *list* endpoints don't carry them — and a check whose
whole population is `null` returns `NOT_APPLICABLE` (H2), i.e. it could never
FAIL. GAP-4 fetches the real signals so the checks can actually fail.

### Okta — `mfaEnrolled` + `isAdmin`

`/api/v1/users` carries neither MFA factors nor admin-role membership. After
enumerating the directory, `enrichAccounts` fans out over each account:

- `GET /api/v1/users/{id}/factors` → `mfaEnrolled = any factor status ACTIVE`
- `GET /api/v1/users/{id}/roles` → `isAdmin = roles.length > 0` (any admin grant)

Bounded-concurrency (`ENRICH_CONCURRENCY = 8`, Okta rate-limits hard), capped
at `MAX_ENRICH = 2000` accounts (logged when it bites — accounts past the cap
keep `null` → NOT_APPLICABLE, never a false PASS). A per-user fetch error
leaves that account at its base `null` rather than failing the whole sync.
Opt out with `enrichPerUser: false` for a huge directory.

### Google Workspace — `ssoEnrolled`

Per-user SAML SSO is not on the Directory user object. `fetchSsoCoverage`
reads the Cloud Identity `inboundSsoAssignments` once and reduces them to
domain-level coverage:

- customer-wide SAML assignment (no `targetOrgUnit`/`targetGroup`) → every
  account `ssoEnrolled = true`
- no SAML assignment at all → every account `ssoEnrolled = false` (sso_enforced
  FAILS — SSO genuinely not configured)
- only OU/group-scoped SAML → `null` (NOT_APPLICABLE): mapping an assignment's
  OU/group to each user needs calls this sync doesn't make, so we don't guess

The token exchange now also requests
`cloud-identity.inboundsso.readonly`. If the DWD grant hasn't authorised it the
assignments fetch 403s and SSO falls back to `null` (fail-safe). Opt out with
`enrichSso: false`.

Okta's `ssoEnrolled` (federated/social credential provider type) and Google's
`isAdmin` / `mfaEnrolled` (Directory `isAdmin`/`isDelegatedAdmin`/
`isEnrolledIn2Sv`) were already real — untouched.

## Files

| File | Role |
| --- | --- |
| `providers/okta/index.ts` | `enrichAccounts` (factors + roles), `mapPool`, `enrichPerUser` config |
| `providers/google-workspace/index.ts` | `fetchSsoCoverage`, SSO scope, `enrichSso` config |

## Decisions

- **Enrichment is per-account HTTP, not Prisma** — the query-shape N+1 guardrail
  (Prisma-read-in-loop) doesn't apply; the fan-out is bounded by concurrency +
  `MAX_ENRICH` and every call is injectable (`fetchImpl` / `getAccessToken` /
  `listSsoAssignments`) so the whole path is unit-tested without live creds.
- **Fail-safe over fail-closed** — an enrichment error degrades a signal to
  `null` (NOT_APPLICABLE), never to a false verdict. A directory sync must not
  break because one user's `/factors` call flaked or an SSO scope is missing.
- **OU/group-scoped Google SSO → `null`, not `false`** — a conservative FALSE
  would manufacture failing verdicts for users who *are* covered by an
  OU-scoped SAML profile. Mapping OU/group resources to users is deferred; the
  customer-wide and no-SSO cases (the common ones) are exact.
- **`enrichPerUser` / `enrichSso` default ON** — the point of the gap is that
  checks measure reality by default; the toggles exist for scale/permission
  edge cases, not as an opt-in.
