# 2026-07-15 — On-prem Active Directory connector (direct LDAPS)

**Commit:** `<pending> feat(integrations): on-prem Active Directory (LDAPS) directory + posture connector`

## Design

The standalone / air-gapped counterpart to the Entra ID connector
(`2026-07-15-entra-id-identity-provider.md`). Entra covers cloud + hybrid
identities (on-prem AD synced up via Azure AD Connect surfaces there with
`onPremisesSyncEnabled: true`); this connector serves estates whose AD is **not**
projected into Entra by binding directly to the customer domain controller over
LDAPS.

Same seam as the other three directory providers: `ActiveDirectoryProvider`
implements `ScheduledCheckProvider` + `IdentitySyncProvider`, normalizes each
user object into the shared `NormalizedIdentityAccount`, and reuses
`runIdentityCheck` — no engine changes, and `IntegrationConnection.provider`
being a free-form `String` means **no schema migration**.

Transport is `ldapts` (LDAP-over-TLS). The LDAP client is behind a minimal
`LdapClientLike` interface and injected via `deps.createClient`, so unit tests
drive the full mapping without a live DC; `ldapts` is `require`-imported lazily
only on the live path, keeping it out of the static/test module graph.

**Signal mapping (H2 fail-honest):**

| Signal        | Source                                              | Notes |
|---------------|-----------------------------------------------------|-------|
| status        | `userAccountControl` ACCOUNTDISABLE bit (0x2)       | disabled → SUSPENDED; vanished accounts → DEPROVISIONED by the sync reconcile |
| `isAdmin`     | direct `memberOf` ∩ configured admin groups         | real true/false → admin checks run |
| `lastActiveAt`| `lastLogonTimestamp` (Windows FILETIME)             | replicated attr, ~14-day lag — fine for dormancy |
| `externalUserId` | `objectGUID` (mixed-endian → canonical GUID)     | immutable across renames/moves; falls back to DN |
| `mfaEnrolled` | — (not in AD)                                       | `null` → `mfa_enforced` NOT_APPLICABLE |
| `ssoEnrolled` | — (not in AD)                                       | `null` → `sso_enforced` NOT_APPLICABLE |

The last two are the deliberate honest gap: on-prem AD carries no MFA or
SSO-federation attribute, so those checks report NOT_APPLICABLE rather than a
manufactured pass — the setup guide points admins at the Entra connector for
MFA/SSO posture.

## Files

| File | Role |
|------|------|
| `src/app-layer/integrations/providers/active-directory/index.ts` | `ActiveDirectoryProvider` — LDAPS bind + paged search + UAC/GUID/FILETIME mapping; injectable client; exported `formatObjectGuid` / `fileTimeToDate` / `cnOf` helpers |
| `src/app-layer/integrations/bootstrap.ts` | Registers `ActiveDirectoryProvider` (registry now has 12 providers) |
| `src/app-layer/jobs/identity-sync.ts`, `usecases/identity-sync.ts`, `usecases/integrations.ts`, `usecases/access-review-connected.ts`, `jobs/schedules.ts` | `active-directory` added to the identity-provider sets, `PROVIDER_CATEGORY` (identity), access-review zod enum, dispatch description |
| `prisma/schema/personnel.prisma` | `ConnectedIdentityAccount.provider` doc comment lists `active-directory` (no schema change) |
| `docs/sub-processors.md` | Inventory row — read-only LDAPS to the customer's own DC |
| `package.json` | Adds `ldapts@^9` (prod-audit clean) |
| `tests/unit/identity-providers.test.ts` | Helper + provider tests — GUID/FILETIME/CN, UAC status, admin membership, fail-closed ERROR, MFA/SSO NOT_APPLICABLE |
| `tests/guardrails/provider-fail-closed-coverage.test.ts`, `tests/guards/integration-bootstrap-runtime-wiring.test.ts` | `active-directory` mapped; `EXPECTED_PROVIDER_IDS` grows to 12 |

## Decisions

- **Direct LDAPS, not an on-prem collector agent.** The user chose direct LDAPS.
  It needs network reachability to the DC (public LDAPS or a VPN/tunnel) and a
  read-only bind; the trade-off vs a collector agent is documented in the setup
  guide. TLS verification is on by default, with an `allowSelfSignedTls` opt-out
  for internal enterprise CAs.
- **`objectGUID` as the stable id.** Immutable across renames/OU moves (unlike
  DN or sAMAccountName), so the idempotent `(tenantId, provider, externalUserId)`
  upsert is stable. Falls back to DN then sAMAccountName if the GUID is absent.
- **Direct group membership only (v1).** `memberOf` does not include nested
  groups or the primary group (rare for admins). Nested resolution via
  `LDAP_MATCHING_RULE_IN_CHAIN` is a documented follow-up.
- **`ldapts` is the only new dependency**, lazy-`require`d. Prod `npm audit`
  (MODERATE+) is clean, satisfying the security-gate ratchet.
