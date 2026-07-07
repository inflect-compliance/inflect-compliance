# 2026-07-07 — PR-5: Device / endpoint monitoring

**Commit:** _(pending)_ `feat(devices): Device inventory + token-authed agent report + posture checks`

## Design

Managed-endpoint posture. `Device` rows carry per-device three-state posture;
an endpoint agent pushes them with a per-tenant device token.

```
agent ──Bearer icdt_…──► POST /devices/report ──verifyDeviceToken──► reportDevice (upsert by serial)
                                                                          │
Device inventory ──runDeviceCheck (null=NOT_APPLICABLE)──► CheckResult (device provider, automation-runner)
```

- **Models** `Device` (compliance.prisma — RLS, `@@unique([tenantId, serialNumber])`,
  employee FK, three-state posture booleans) + `TenantDeviceToken` (auth.prisma —
  cloned from `TenantApiKey`, SHA-256 hash at rest, `@@unique([tokenHash])`).
- **Token auth** `device-token-auth.ts` (clone of `api-key-auth.ts`):
  `generateDeviceToken` (`icdt_` prefix), `hashDeviceToken` (SHA-256),
  `verifyDeviceToken` (hash lookup → tenantId, checks expiry/revoked, touches
  lastUsedAt). The report route additionally verifies the token's tenant matches
  the URL slug.
- **Checks** `runDeviceCheck` (pure) — `devices_{encrypted,screenlock,antivirus,password_manager}`.
  THREE-STATE: null = NOT_APPLICABLE, excluded from pass/fail (never a fail). The
  internal `device` provider queries Device scoped to tenantId and applies them.
- **Usecases** `reportDevice` (token-authed upsert), `issueDeviceToken` /
  `revokeDeviceToken` / `listDeviceTokens` / `listDevices` (personnel-permission
  gated — devices are part of the people layer, reusing PR-4's permission).
- **UI** `/devices` list (EntityListPage + platform filter, tri-state posture
  badges). Routes: `POST /devices/report` (token), `GET /devices`,
  `GET/POST /admin/device-tokens`, `DELETE /admin/device-tokens/[id]`.
- **Stub agent** `scripts/device-agent-report.mjs`.

## Scope

- **MDM (Jamf/Intune) connector deferred** — the token-report path ships first
  (the novel auth primitive). The MDM sync-provider is the proven Okta/BambooHR
  pattern, a clean follow-up.
- **Admin device-tokens UI deferred** — issue/revoke work via API; a management
  UI (clone of `admin/api-keys`) is a follow-up.
- Reused PR-4's `personnel` permission rather than minting a `device` domain
  (avoids a second permission blast radius; devices are part of the people layer).

## Decisions

- **Device token, not a user key.** An endpoint agent has no login, so a
  dedicated per-tenant token (hash-at-rest, revocable, tenant-slug-bound) is the
  credential — modelled on `TenantApiKey`.
- **Three-state posture.** `null` is a first-class NOT_APPLICABLE, never coerced
  to fail — a Linux box without a screen-lock probe must not fail the fleet.
