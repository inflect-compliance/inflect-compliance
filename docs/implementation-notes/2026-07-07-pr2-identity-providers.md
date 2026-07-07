# 2026-07-07 — PR-2: Okta + Google Workspace identity providers

**Commit:** _(pending)_ `feat(integrations): Okta + Google Workspace identity providers + ConnectedIdentityAccount`

## Design

Two directory providers on the existing `ScheduledCheckProvider` engine, plus a
new synced-accounts model and a scheduled sync job. Both providers normalize
their directory into ONE shape and run the SAME checks, so a third directory
(Entra ID, JumpCloud) is incremental.

```
Okta / Google Workspace API
      │ listAccounts()  (injectable seam — real HTTP by default, stub in tests)
      ▼
NormalizedIdentityAccount[]  ──► runIdentityCheck()  ──► CheckResult (per-account pass/fail)
      │                                                        │
      │ identity-sync job                                      │ automation-runner (existing)
      ▼                                                        ▼
ConnectedIdentityAccount (upsert + reconcile)          IntegrationExecution / Evidence / Finding
```

- **Providers** (`integrations/providers/okta/`, `.../google-workspace/`) implement
  `ScheduledCheckProvider` **and** a new `IdentitySyncProvider` (`listAccounts`).
  The HTTP fetch is injectable (`deps.listAccounts` / `getAccessToken` / `fetchImpl`)
  so unit tests exercise the check + sync logic without live credentials.
- **Checks** (`providers/identity/types.ts::runIdentityCheck`) — shared across both
  providers: `mfa_enforced`, `no_dormant_admins`, `admin_count_within_threshold`,
  `sso_enforced`. Each emits per-account verdicts in `CheckResult.details` (capped
  at 500). A control with `automationKey:"okta.mfa_enforced"` +
  `evidenceSource:'INTEGRATION'` flips PASSED/FAILED from live data via the existing
  runner — no runner change needed.
- **Model** `ConnectedIdentityAccount` (`compliance.prisma`) — RLS triple (standard
  non-nullable tenant), `@@unique([tenantId, provider, externalUserId])` +
  `@@index([tenantId, provider])` + `@@index([tenantId, status])`.
- **Sync** — `identity-sync` job (per connection) → `runIdentitySync` usecase
  (tenant-scoped `runInTenantContext`, no global prisma): upsert idempotently by
  `(tenantId, provider, externalUserId)`, reconcile vanished accounts to
  DEPROVISIONED, record ONE `IntegrationExecution`. `identity-sync-dispatch` (daily
  cron) fans out one job per enabled identity connection (SharePoint pattern).

## Files

| File | Role |
| --- | --- |
| `prisma/schema/enums.prisma` | `ConnectedAccountStatus` enum |
| `prisma/schema/compliance.prisma` | `ConnectedIdentityAccount` model |
| `prisma/schema/auth.prisma` | Tenant back-relation |
| `prisma/migrations/20260707100000_connected_identity_account/` | table + enum + RLS triple |
| `src/app-layer/integrations/providers/identity/types.ts` | normalized shape + `runIdentityCheck` + `IdentitySyncProvider` |
| `src/app-layer/integrations/providers/okta/index.ts` | Okta provider |
| `src/app-layer/integrations/providers/google-workspace/index.ts` | Google Workspace provider |
| `src/app-layer/usecases/identity-sync.ts` | tenant-scoped sync usecase |
| `src/app-layer/jobs/identity-sync.ts` | worker + dispatch fan-out |
| `src/app-layer/jobs/{types,executor-registry,schedules}.ts` | 5-step job wiring |
| `src/app-layer/integrations/bootstrap.ts` | provider registration |

## Decisions

- **Injectable HTTP seam.** Directory fetch is behind `deps.listAccounts`, so the
  check + sync logic is fully unit-tested without live creds. The Google
  service-account JWT→token exchange (`getGoogleAccessToken`) is the one part that
  needs live credentials to validate end-to-end; it is isolated and documented.
- **Reconcile-to-DEPROVISIONED.** Accounts absent from a sync are marked
  deprovisioned (bounded `updateMany`, excludes the seen set) — this is what makes
  PR-4's `offboarded_access_removed` check accurate (terminated employee × still-
  ACTIVE account).
- **Directory metadata is not encrypted.** Email + status flags are not business
  content; only connection *secrets* are encrypted (existing `secretEncrypted`).
- **isAdmin/mfa fidelity.** Okta admin-role + factor enrichment is per-user (N+1);
  the first cut derives what the `/users` list exposes (federation → sso, factors →
  mfa) and leaves deep role enrichment as a documented follow-up. Google Workspace
  exposes `isAdmin` / `isEnrolledIn2Sv` directly on the user object.
