# 2026-06-28 — NIS2 Article 23 incident response + notification deadlines

**Commit:** `<pending> feat(incidents): NIS2 Article 23 incident response + notification deadlines`

## Attribution

The **methodology** — the seven-phase incident-response flow, the
four-level severity scale, and the 24h / 72h / 1-month notification
deadline structure — is adapted (CC BY 4.0) from
[`Kshreenath/NIS2-Checklist`](https://github.com/Kshreenath/NIS2-Checklist),
authored by **Paolo Carner / BARE Consulting**. None of the source
RTF playbook prose (SMB-generic, Belgium/Netherlands-specific) was
ported — only the process model, rebuilt native in IC's stack. The
source repo carries a "not legal advice" disclaimer; IC carries the
same one prominently in the incident UI.

## Design

IC had **no** incident-response capability. NIS2 Article 23 is a hard
legal obligation (early warning ≤ 24h → detailed report ≤ 72h → final
report ≤ 1 month), so for a NIS2-flagship product this was a real gap.

### Incident ≠ Finding (load-bearing)

The single most important design decision: an **Incident is a live
security event**, distinct from a **Finding (an audit observation)**.
They are not overloaded onto one model. A Finding documents "control X
is not implemented"; an Incident documents "the billing cluster was
ransomwared at 02:14, here is the clock to the regulator." Different
lifecycle, different urgency, different audience (security team vs
auditor). `Finding` was left untouched.

### The three models

```
Incident ──1:N── IncidentNotification   (the Article 23 deadline clock)
         └─1:N── IncidentTimelineEntry   (append-only forensic narrative)
```

- `Incident` — `detectedAt` is the clock that drives every deadline.
  `reportable` defaults `false` and is only ever set by an explicit
  human decision (see below). `linkedControlIds` ties the incident to
  the Art.21(2) controls it implicates.
- `IncidentNotification` — one row per required notification kind,
  auto-created (exactly three) when an incident is marked reportable.
  `dueAt = detectedAt + {24h, 72h, 1 month}`. Status walks
  `PENDING → DUE → OVERDUE` (or `SUBMITTED` / `NOT_REQUIRED`).
- `IncidentTimelineEntry` — append-only who-did-what-when. Distinct
  from `AuditLog` (the hash-chained *system* audit); this is the
  incident *narrative* the responders write.

All three are tenant-scoped with Epic A.1 RLS (Class-A:
`tenant_isolation` + `tenant_isolation_insert` + `superuser_bypass` +
`FORCE`), Epic B field encryption on every free-text column
(`Incident.description`, `IncidentNotification.submissionNote`,
`IncidentTimelineEntry.entry`), and Epic D sanitisation at the usecase
write seams. Children use the composite `[incidentId, tenantId]` FK to
`Incident(id, tenantId)` so a row can never reference a foreign
tenant's incident.

### The deadline clock — the regulatory teeth

`src/app-layer/jobs/incident-notification-deadlines.ts` runs **hourly**
(a 24h deadline needs sub-day granularity). It flips `PENDING→DUE` as a
deadline's lead window opens, `→OVERDUE` once `dueAt` passes without a
SUBMITTED report, and fires an in-app notification to the incident
owner + every tenant OWNER/ADMIN on each transition. OVERDUE is the
loud one: a regulatory deadline was missed. The job is batched (one
candidate fetch, two `updateMany` status writes, one membership fetch,
one notification `createMany`) so it respects the N+1 guardrail, and is
idempotent (status transitions + per-(deadline, type, day) dedupe keys)
so a retry is safe.

### Reportability is a suggestion, never a legal determination

NIS2 requires notification for incidents of "significant impact". IC
encodes a **default heuristic** (`suggestsReportable`: HIGH/CRITICAL →
suggested) but **never auto-asserts** the obligation. `markReportable`
requires an explicit boolean — the human decision. The tenant's
DPO/legal owns the call; the UI says so. `createIncident` never sets
`reportable: true`.

### Jurisdiction awareness

The notification **authority** is jurisdiction-specific (CCB in
Belgium, NCSC-NL in the Netherlands, BSI in Germany, …). Rather than
hard-code, `TenantSecuritySettings.incidentAuthority` is a tenant-
configurable free-text field; the incident view surfaces
"notify: &lt;authority&gt;".

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | The 3 models |
| `prisma/schema/enums.prisma` | 4 incident enums + 2 NotificationType values |
| `prisma/schema/auth.prisma` | Tenant relations + `TenantSecuritySettings.incidentAuthority` |
| `prisma/migrations/20260628120000_nis2_incident_response/` | Tables + indexes + FKs + RLS |
| `prisma/migrations/20260628120100_incident_notification_types/` | `ALTER TYPE NotificationType` |
| `src/lib/incidents/deadlines.ts` | Pure deadline math + phase order + reportable heuristic |
| `src/app-layer/schemas/incident.schemas.ts` | Zod request schemas |
| `src/app-layer/repositories/IncidentRepository.ts` | All Prisma queries |
| `src/app-layer/policies/incident.policies.ts` | `incidents.view` / `incidents.manage` asserts |
| `src/app-layer/usecases/incident.ts` | The 7-phase workflow + reportability + submit |
| `src/app-layer/jobs/incident-notification-deadlines.ts` | The hourly deadline clock |
| `src/app-layer/jobs/{schedules,executor-registry,types}.ts` | Job registration |
| `src/lib/permissions.ts` | `incidents` permission domain |
| `src/lib/security/route-permissions.ts` | Route → permission rules |
| `src/lib/security/encrypted-fields.ts` | Encryption manifest entries |
| `src/lib/swr-keys.ts` | `CACHE_KEYS.incidents` |
| `src/app/api/t/[tenantSlug]/incidents/**` | 7 route handlers (all `requirePermission`) |
| `src/app/t/[tenantSlug]/(app)/incidents/**` | List + detail UI, dashboard summary |

## Decisions

- **Reportability is human-confirmed, not auto-asserted.** Encoding a
  legal reporting obligation off severity alone would be wrong and
  dangerous. The heuristic only *suggests*; a human flips the bit. This
  is the "not legal advice" disclaimer made structural.
- **The deadline clock is the product, not the form.** IC tracks +
  reminds; it does NOT file with the CCB/NCSC on the tenant's behalf
  (a future, large integration). The value is "an incident reportable
  for 23 hours with no early warning filed should be screaming at you."
- **Incident narrative ≠ system audit.** `IncidentTimelineEntry` is a
  separate, encrypted, append-only narrative — not the hash-chained
  `AuditLog`. Both fire: workflow actions also write `logEvent`.
- **`submissionRef` stays plaintext** (the authority case ref is a
  load-bearing lookup key, not sensitive content); only the free-text
  `submissionNote` / `description` / `entry` are encrypted.
- **Hourly cadence, not daily.** A daily cron would let a 24h deadline
  lapse by up to a day before the OVERDUE alert fired. Hourly is the
  coarsest cadence that keeps a 24h deadline meaningful.
- **`incidents.manage` is a privileged security-team action.** Not a
  general `EDITOR` capability — only OWNER/ADMIN by default. Every
  member can `view` for compliance visibility.

## What this is NOT

- Legal advice — the thresholds + deadlines are operational aids.
- Auto-submission to authorities — IC tracks + reminds only.
- A SIEM / detection tool — incidents are human-created.
- An overload of `Finding` — incidents are live events; findings are
  audit observations. Separate, deliberately.
