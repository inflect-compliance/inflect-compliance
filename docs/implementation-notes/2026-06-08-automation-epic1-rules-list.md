# 2026-06-08 — Automation Epic 1: Rule List & Status Dashboard

**Commit:** `<sha>` feat(automation): Epic 1 — rule inventory tab + rules API

First slice of the Workflow Automation GUI roadmap (Archer parity). Surfaces
the existing `AutomationRule` data as a browsable inventory and opens the
REST surface the later epics build on.

## Design

```
ProcessesClient (NEW: Canvas | Rules tab bar)
└── Rules tab → RulesTab (EntityListPage)
      └── useTenantSWR(CACHE_KEYS.automation.rules.list())
            └── GET /api/t/[slug]/automation/rules
                  └── listAutomationRules usecase
                        └── assertCanReadAutomation + AutomationRuleRepository.list
```

The automation foundation (model, repository, bus, events, policies) already
existed from Epic 60 — this epic adds the usecase + HTTP + UI layers on top.

## Files

| File | Role |
|------|------|
| `src/app-layer/usecases/automation-rules.ts` | NEW — list/get/create/update/archive; policy + tenant-context + audit |
| `src/app-layer/schemas/automation.schemas.ts` | NEW — create/update Zod; action config discriminated by actionType |
| `src/app/api/t/[tenantSlug]/automation/rules/route.ts` | NEW — GET list (status/trigger/action filters) + POST create |
| `src/app/api/t/[tenantSlug]/automation/rules/[id]/route.ts` | NEW — GET/PUT/DELETE(archive) |
| `src/app/t/[tenantSlug]/(app)/processes/RulesTab.tsx` | NEW — EntityListPage inventory, in-memory filtering |
| `src/app/t/[tenantSlug]/(app)/processes/automation-filter-defs.ts` | NEW — status/trigger/action filter defs |
| `src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx` | MODIFY — Canvas \| Rules tab bar |
| `src/lib/swr-keys.ts` | MODIFY — `CACHE_KEYS.automation.*` registry |

## Decisions / deviations from the roadmap

- **Authorise via the automation module's own policies, not new
  `PermissionSet` keys.** The roadmap proposed `automation.manage` /
  `automation.view` + `requirePermission`. But the domain already ships
  dedicated RBAC (`assertCanReadAutomation` = any member,
  `assertCanManageAutomation` = ADMIN), and `/automation/` is not a
  `PRIVILEGED_ROOTS` entry in the api-permission-coverage guard — so the
  usecase-policy pattern (same as controls/risks/evidence) is correct and
  avoids touching all five role definitions + route-permissions.ts.
- **Tab bar lands in Epic 1, not Epic 9.** The roadmap put the tab bar in
  Epic 9, but the Rules tab must be *reachable* to be a shippable slice, so
  a minimal `Canvas | Rules` `TabSelect` ships now. Epic 9 extends it with
  Analytics (+ lazy-loading); Epic 10 adds Monitor.
- **In-memory filtering.** Rule counts are small (tens), so the status /
  trigger / action filters apply over the fetched list rather than
  round-tripping multi-select values as query params — keeps the API query
  schema single-enum-clean.
- **No create button yet.** The `+ Rule` header action opens the builder
  modal from Epic 3; until then the inventory is read-only (rules arrive via
  API/seed). Epic 3 wires the button.

## Routes-call-usecases invariant

The structural ratchet (`tests/guards/automation-epic1-rules.test.ts`)
asserts the routes import the usecases and never reference
`AutomationRuleRepository` directly — preserving the HTTP → usecase → repo
layering.
