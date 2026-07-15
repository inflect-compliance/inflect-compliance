# 2026-07-15 — Microsoft Entra ID (Azure AD) identity connector

**Commit:** `feat(integrations): Microsoft Entra ID (Azure AD) directory + posture connector`

## Design

Adds a third directory connector alongside Okta and Google Workspace, following
the exact `ScheduledCheckProvider` + `IdentitySyncProvider` seam established in
`2026-07-07-pr2-identity-providers.md`. The provider normalizes the Entra
directory into the shared `NormalizedIdentityAccount` shape and reuses
`runIdentityCheck`, so all four identity checks (`mfa_enforced`,
`no_dormant_admins`, `admin_count_within_threshold`, `sso_enforced`) work with
zero engine changes.

`IntegrationConnection.provider` is a free-form `String` and
`ConnectedIdentityAccount` is keyed by `(tenantId, provider, externalUserId)`
with `provider` a string — so **no schema migration** was required. The connector
is a pure code addition plus wiring.

Auth is the OAuth2 **client-credentials** grant against an Entra app
registration (Directory/tenant id + Application/client id + client secret).
Unlike Okta's per-user `/factors` + `/roles` fan-out, Microsoft Graph exposes
**bulk** enrichment surfaces, so a full directory enriches in a small, bounded
number of requests:

| Signal        | Graph surface                                                    | Scope needed        |
|---------------|------------------------------------------------------------------|---------------------|
| accounts      | `/users` (paginated, `$select`)                                  | `User.Read.All`     |
| `isAdmin`     | `/directoryRoles?$expand=members` (user members of any active role) | `Directory.Read.All` |
| `mfaEnrolled` | `/reports/authenticationMethods/userRegistrationDetails`         | `AuditLog.Read.All` |
| `ssoEnrolled` | `/domains` authenticationType (`Federated` vs `Managed`) → per-user by email domain | `Directory.Read.All` |
| `lastActiveAt`| `/users` `signInActivity.lastSignInDateTime`                     | `AuditLog.Read.All` + Entra ID P1 |

Every enrichment is best-effort and wrapped: a missing scope leaves that signal
`null`, which the shared engine renders as **NOT_APPLICABLE** rather than a
false PASS (the H2 fail-honest contract). `signInActivity` in `$select` 4xxs on
tenants without the licence/scope, so the enumeration retries once with a
reduced projection instead of failing the whole sync.

**Hybrid-AD coverage.** On-prem Active Directory identities synced to Entra via
Azure AD Connect surface *through* this connector (they carry
`onPremisesSyncEnabled: true`), which matches how the large majority of orgs run
AD — so this connector already covers hybrid estates with no LDAP reachability
required. Estates running **standalone** on-prem AD with no Entra sync are served
by a separate direct-LDAPS `ActiveDirectoryProvider` (delivered in the follow-up
PR), which binds to the customer domain controller over LDAPS. The two
connectors are complementary: Entra for cloud + hybrid identities, the LDAPS
connector for air-gapped / non-synced AD.

## Files

| File | Role |
|------|------|
| `src/app-layer/integrations/providers/entra-id/index.ts` | The `EntraIdProvider` — Graph enumeration + bulk enrichment + shared checks; injectable token/fetch for tests |
| `src/app-layer/integrations/bootstrap.ts` | Registers `EntraIdProvider` in the provider registry |
| `src/app-layer/jobs/identity-sync.ts` | `entra-id` added to the dispatch fan-out set |
| `src/app-layer/usecases/identity-sync.ts` | `entra-id` added to the sync-eligible provider set |
| `src/app-layer/usecases/integrations.ts` | `entra-id` added to `IDENTITY_SYNC_PROVIDERS` + `PROVIDER_CATEGORY` (identity) |
| `src/app-layer/usecases/access-review-connected.ts` | `entra-id` added to the access-review provider set + zod enum |
| `src/app-layer/jobs/schedules.ts` | Dispatch description mentions Entra ID |
| `prisma/schema/personnel.prisma` | Doc comment on `ConnectedIdentityAccount.provider` lists `entra-id` (no schema change) |
| `tests/unit/identity-providers.test.ts` | `EntraIdProvider` unit tests — routing, fail-closed ERROR, bulk enrichment, all-unknown → NOT_APPLICABLE |
| `tests/guardrails/provider-fail-closed-coverage.test.ts` | `entra-id` mapped in `FAIL_CLOSED_COVERAGE` |
| `tests/guards/integration-bootstrap-runtime-wiring.test.ts` | `EXPECTED_PROVIDER_IDS` grows to 11 |

## Decisions

- **`ssoEnrolled` derived from domain `authenticationType`, not a blanket `true`.**
  An Entra account is not automatically "SSO-federated" — cloud-managed domains
  are `Managed`, AD FS / external-IdP domains are `Federated`. We map each
  account to its email-domain's authentication type; unknown domains (e.g. guest
  `#EXT#`) stay `null`. This keeps `sso_enforced` honestly failable instead of a
  guaranteed pass — the same reasoning Google Workspace applies to SAML SSO.
- **`isAdmin` is authoritative when the role fetch succeeds.** `/directoryRoles`
  returns only *activated* roles; a user member of any is an admin, and every
  other account is explicitly `false` — so the admin checks run for real (unlike
  base Okta, where role membership starts `null`). If the role fetch fails, all
  `isAdmin` fall back to `null` → admin checks NOT_APPLICABLE.
- **No new dependency.** Graph is reached with raw `fetch`, matching the Okta /
  Google Workspace providers — no Microsoft SDK.
- **Separate from Entra SSO login.** This connector is a directory/posture
  collector; it does not touch the existing NextAuth Entra ID SSO provider or
  the EI1–EI4 group-claims machinery. The setup guide states this explicitly.
