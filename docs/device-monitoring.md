# Device / endpoint monitoring (PR-5)

Managed-endpoint posture: an inventory of `Device` rows with per-device
security posture (disk encryption, screen lock, antivirus, password manager),
surfaced at `/devices` and checkable via `device.*` automation controls.

## Ingest paths

**1. Device-agent report (token-authed).** An endpoint agent POSTs its posture
to `POST /api/t/<slug>/devices/report` with a per-tenant **device token**
(`Authorization: Bearer icdt_…`). No user session — the token IS the tenant
credential (SHA-256-hashed at rest, revocable). The token's tenant must match
the URL slug. The device is upserted by `(tenantId, serialNumber)`.

Issue a token under **Admin → Device tokens** or
`POST /api/t/<slug>/admin/device-tokens` (`personnel.manage`); revoke via
`DELETE …/admin/device-tokens/<id>`. The plaintext is shown **once**.

A reference agent stub is `scripts/device-agent-report.mjs` — replace its
`collectPosture()` with real platform probes.

**2. MDM connector (Jamf / Intune).** A sync-provider path following the
Okta/BambooHR pattern — **deferred**; the token path ships first.

## Report JSON schema

```jsonc
{
  "serialNumber": "C02X...",      // required, unique per tenant
  "hostname": "alice-mbp",         // optional
  "platform": "MACOS",             // MACOS | WINDOWS | LINUX (required)
  "diskEncrypted": true,           // boolean | null
  "screenLockEnabled": true,       // boolean | null
  "antivirusRunning": null,        // boolean | null
  "passwordManagerPresent": false  // boolean | null
}
```

**Three-state booleans.** `true` = pass, `false` = fail, `null` =
NOT_APPLICABLE (e.g. Linux has no screen-lock check). **Never send `false` for
a check that does not apply — send `null`.** Null is excluded from both the
pass and fail tallies; a check never fails because of a null.

## Checks

`device.devices_encrypted`, `device.devices_screenlock`,
`device.devices_antivirus`, `device.devices_password_manager`. Set a control's
`automationKey` to one of these + `evidenceSource = INTEGRATION` and the runner
flips it PASSED/FAILED from the live inventory. Map to ISO 27001 A.8 / SOC 2
CC6 via the control's framework requirements.

## Security

- Device tokens are SHA-256-hashed at rest (`TenantDeviceToken.tokenHash`),
  never stored in plaintext; the report route rejects a token whose tenant
  doesn't match the URL slug.
- `Device` + `TenantDeviceToken` are RLS-isolated + tenant-indexed.
