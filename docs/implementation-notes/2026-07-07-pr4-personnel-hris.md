# 2026-07-07 — PR-4: Personnel / HR domain + HRIS sync

**Commit:** _(pending)_ `feat(personnel): Employee hub + BambooHR sync + personnel checks`

## Design

The people-layer hub. `Employee` is the anchor PR-5 (devices) and PR-6
(training/background) attach to. Synced from an HRIS or entered manually;
the offboarded-access check joins it against PR-2's `ConnectedIdentityAccount`.

```
BambooHR API ──listEmployees()──► NormalizedEmployee[] ──hris-sync──► Employee (upsert + manager-link)
                                                                          │
Employee × ConnectedIdentityAccount ──runPersonnelCheck()──► CheckResult (per-item pass/fail)
        (personnel provider, automation-runner)
```

- **Model** `Employee` (compliance.prisma): RLS triple, `@@unique([tenantId, workEmail])`,
  `@@index([tenantId, status])`, self-FK `managerEmployeeId` (`@@index([tenantId, managerEmployeeId])`).
- **HRIS** `BambooHrProvider` — a sync provider (`listEmployees`, injectable). `hris-sync`
  usecase (tenant-scoped, no global prisma) upserts idempotently by
  `(tenantId, workEmail)`, then a **second pass** resolves `managerEmail → managerEmployeeId`
  via one query + in-memory map (no N+1). `hris-sync-dispatch` daily cron fans out.
- **Personnel checks** `runPersonnelCheck` (pure) — `offboarded_access_removed`
  (TERMINATED employee × ACTIVE account on email), `onboarding_complete_within_sla`,
  `every_employee_has_manager`. The `personnel` provider is INTERNAL: it queries the
  tenant DB (raw prisma + explicit tenantId, the automation-runner's own pattern) and
  applies the pure check. A control with `automationKey:"personnel.offboarded_access_removed"`
  flips PASSED/FAILED live.
- **Permission** new `personnel: { view, manage }` on `PermissionSet` (OWNER/ADMIN manage;
  all view). Blast radius: the roles-admin `PERMISSION_SCHEMA` + a few test literals.
- **UI** `/personnel` list (EntityListPage + status filter) + `/personnel/[id]` overview
  (tabs reserved for PR-5/6). API `GET/POST /api/t/:slug/personnel`.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/{enums,compliance,auth}.prisma` + migration | `EmploymentStatus` + `Employee` + RLS |
| `integrations/providers/hris/index.ts` | BambooHR sync provider |
| `integrations/providers/personnel/{checks,index}.ts` | pure checks + internal provider |
| `usecases/{hris-sync,personnel}.ts` | tenant-scoped sync + list/create |
| `jobs/hris-sync.ts` + wiring | worker + dispatch |
| `app/.../personnel/**` | list + detail + filter-defs |
| `lib/permissions.ts` | `personnel` permission |

## Decisions

- **Scope: no PersonnelTask.** The optional onboarding/offboarding checklist model is
  deferred — the roster + the three checks deliver the roadmap's "done when". Onboarding
  reminders ride the existing SLA check for now.
- **Internal personnel provider.** The checks read tenant data, so unlike external
  providers the `personnel` provider queries the DB (scoped to `input.tenantId`). The
  join logic is a pure function, unit-tested without a DB.
- **Manager link is a second pass**, keyed by email → id, to avoid ordering dependence
  and N+1.
- **Employee is DSAR-relevant PII** (name + work email) — classified `PII subject` in
  data-retention; no TTL today (tracks the live roster).
