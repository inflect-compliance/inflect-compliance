# 2026-06-27 — ORG_INITIATIVES widget + portfolio programme tracking

**Commit:** `<pending>` feat(org-dashboard): ORG_INITIATIVES widget + portfolio programme tracking

## What

Portfolio-level **security initiatives** — discrete, named improvement
programmes ("Roll out MFA org-wide", "Achieve SOC 2") the org tracks
across its tenants, with their own lifecycle + progress. A dashboard
widget (top-N in flight + at-risk) plus a full `/org/[slug]/initiatives`
list + detail surface. Third curated org-dashboard widget after
ORG_THREAT_LEVEL (#1290) and ORG_MATURITY (#1291).

**Credit:** concept ported from Cybether (github.com/jccyberx/Cybether,
**MIT**) — its "Security Projects" tracker. Idea only.

## The load-bearing distinction: initiative ≠ task

The platform has tenant-level Task / ControlTask / RiskTreatmentPlan
(atomic remediation — "fix gap X in tenant Y"). It had NO portfolio-level
PROGRAMME. An Initiative is a strategic container that **links** tenant
work for rollup; it doesn't replace it. A Task answers "fix gap X"; an
Initiative answers "what strategic programmes are in flight across the
portfolio and how far along".

## Cross-tenant link resolution — the careful part

`OrgInitiativeLink` links work in ANY tenant the org owns, storing the
tenant ref + entity ref. Progress rollup resolves each linked entity's
completion status by **crossing into that tenant's data through the
SANCTIONED path** — `withTenantDb(tenantId, db => …)` per tenant (runs as
`app_user`, RLS enforced via the org's auto-provisioned AUDITOR
membership; the same pattern `portfolio.ts` uses for drill-down). It
**never** bypasses tenant isolation with a raw cross-tenant prisma read.
Links are grouped by tenant → one transaction per tenant, batch-read by
type. `linkWork` validates the target tenant belongs to the org first.

## Premise fix — `tenantId` → `linkedTenantId`

The prompt's link model named the column `tenantId`. But the platform's
invariant is **"a `tenantId` field = RLS-isolated tenant data"** — the
RLS-coverage + schema-index guardrails auto-detect ANY model with a
`tenantId` field as tenant-scoped (`enumerateDirectTenantScopedModels`,
no exclusion hook). `OrgInitiativeLink` is org-owned cross-tenant link
metadata, NOT tenant-isolated, so the column is named **`linkedTenantId`**
(a reference, not an isolation column). Documented; the ratchet asserts
the name.

## Progress model

`manualProgressPercent` WINS; else `completed / total` of linked work
(cross-tenant rollup). "At risk" = BLOCKED OR (past `targetDate` and not
COMPLETED/CANCELLED). "Stale" = IN_PROGRESS with no update in 30 days.
`deriveProgress` is a pure, unit-tested function. The trend is free — each
status change is a history-shaped event; no snapshot job.

## Permission

Write = `canConfigureDashboard` (ORG_ADMIN) — initiatives are managed from
the org dashboard surface by the same admin; no separate flag in v1 (all
org-write is ORG_ADMIN). Create + status-change are substantive → they
audit via new `ORG_INITIATIVE_CREATED` / `ORG_INITIATIVE_STATUS_CHANGED`
`OrgAuditAction` values.

## Files

| File | Role |
|------|------|
| `prisma/schema/enums.prisma` | `InitiativeStatus` + `ORG_INITIATIVES` type + 2 audit actions |
| `prisma/schema/auth.prisma` | `OrgSecurityInitiative` + `OrgInitiativeLink` (linkedTenantId) + back-relations |
| `prisma/migrations/20260627150000_org_security_initiative/` | enums + 2 tables + indexes + FKs |
| `src/app-layer/usecases/org-security-initiative.ts` | CRUD + link/unlink + cross-tenant progress rollup + audit |
| `src/app-layer/schemas/org-dashboard-widget.schemas.ts` | ORG_INITIATIVES Zod variant |
| `src/app/api/org/[orgSlug]/initiatives/**` | list/create · get/patch/delete · status · links POST/DELETE |
| `src/app/org/[orgSlug]/(app)/OrgInitiativesWidget.tsx` | top-N ProgressBar rows + at-risk + staleness |
| `src/app/org/[orgSlug]/(app)/initiatives/**` | list (org-table) + detail (links, status, unlink via Epic 67 undo-toast) |
| `src/app/org/[orgSlug]/(app)/{widget-dispatcher,page}.tsx` | dispatch case + initiatives on PortfolioData |
| `src/app-layer/usecases/org-dashboard-presets.ts` | wide ORG_INITIATIVES card at the bottom |
| `tests/guardrails/org-initiatives-widget.test.ts` | structural ratchet |
| `tests/e2e/org-initiatives.spec.ts` | create → link cross-tenant → rollup → dashboard → at-risk |

## What this is NOT

- Not a replacement for tenant Tasks (atomic remediation) — initiatives
  are strategic containers that LINK tenant work.
- Not a full PM tool (no Gantt/resource allocation; the Epic 59 gantt
  primitive is available for a future timeline view).
- Not a tenant-dashboard widget (org-level portfolio concept).
- Not auto-created from frameworks (future).
- Not addable via the WidgetPicker yet (preset-seeded; API/Zod accept it).
