# 2026-06-08 — Entra group → IC-role mapping, config plane (EI-2)

**Commit:** `<sha>` feat(auth): Entra group → IC-role mapping config plane (EI-2)

## Why

EI-1 made `token.aadGroups` reliably populated at sign-in but had nothing to map
it to — "group-based role assignment had no input" became "group-based role
assignment has input but no rules". EI-2 is the **config plane**: a per-tenant
table of `aadGroupId → role` rules an admin manages in the Entra wizard. EI-3
(runtime) consumes these at sign-in.

## Design

**Model.** `TenantEntraGroupMapping` (tenantId, aadGroupId, aadGroupName?, role,
priority, createdByUserId?) with `@@unique([tenantId, aadGroupId])` (one rule per
group) and `@@index([tenantId])`. Tenant-scoped → full RLS (the three canonical
policies: `tenant_isolation` USING, `tenant_isolation_insert` WITH CHECK,
`superuser_bypass`) in migration `20260609090000_ei2_tenant_entra_group_mapping`.

**Resolver.** `resolveRoleFromGroups(aadGroups, mappings)` in
`src/lib/auth/entra-role-mapping.ts` is pure + deterministic: winner = highest
`priority`, ties broken by role seniority, then by `aadGroupId` lexicographically.
Split out (not inlined in the usecase) so EI-3's sign-in path and any future
"what role would this user get?" preview share one ranking, and so it's
exhaustively unit-testable. Returns `{ role: null }` on no match — the caller
(EI-3) decides what that means.

**CRUD usecase + routes.** `entra-group-mappings.ts` (list/create/update/delete)
mirrors the sibling `entra-provider` usecase: `assertCanAdmin`,
`runInTenantContext`, `logEvent`. Routes live under the existing SSO config root
`/api/t/:slug/sso/entra/group-mappings` (+ `/:mappingId`), already gated by
`admin.manage` via `route-permissions.ts`. A duplicate group (`P2002`) surfaces
as a 409 conflict.

**Admin UI.** A third section in the `admin/entra` wizard — a div-based mapping
list (group name/id, role badge, priority) + an add-row form (Combobox role
picker, NumberStepper priority). Delete uses the Epic 67 `useToastWithUndo`
optimistic-remove + 5 s undo pattern.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/auth.prisma` | **New model** `TenantEntraGroupMapping` + Tenant back-relation. |
| `prisma/migrations/20260609090000_…/migration.sql` | **New.** Table + indexes + FK + RLS. |
| `src/app-layer/schemas/entra-group-mapping.schemas.ts` | **New.** Zod create/update + `ENTRA_MAPPABLE_ROLES`. |
| `src/lib/auth/entra-role-mapping.ts` | **New.** Pure `resolveRoleFromGroups`. |
| `src/app-layer/usecases/entra-group-mappings.ts` | **New.** Admin-gated CRUD + audit. |
| `src/app/api/t/[tenantSlug]/sso/entra/group-mappings/{route,[mappingId]/route}.ts` | **New.** Collection + item routes. |
| `src/app/t/[tenantSlug]/(app)/admin/entra/GroupMappingsSection.tsx` | **New.** Mappings management UI. |
| `tests/guardrails/schema-index-coverage.test.ts` | Registered the model (Layer C-completeness). |
| `tests/guards/entra-ei2-group-mapping.test.ts` | **New ratchet.** Locks model + RLS + resolver + routes + OWNER exclusion. |

## Decisions

- **OWNER is not a mappable role.** Ownership carries `admin.tenant_lifecycle` +
  `admin.owner_management` and the last-OWNER guard — it must stay manually
  granted. The Zod `ENTRA_MAPPABLE_ROLES` enum (ADMIN/EDITOR/READER/AUDITOR)
  enforces this; the guard asserts `'OWNER'` never appears. ADMIN *is* allowed
  because a mapping is deliberately configured by an existing admin (unlike
  SSO-JIT, which clamps to READER|EDITOR since no human vets the auto-assignment).
- **`priority` over pure role-seniority.** Real tenants have overlapping groups
  ("All-Staff" → READER, "Security-Admins" → ADMIN). An explicit admin-set
  priority is clearer than inferring intent from role rank; seniority is only the
  tie-break.
- **No membership creation here.** EI-2 is config only; it never writes
  `TenantMembership`, so the Epic 1 no-auto-join allowlist is untouched. EI-3
  will *sync the role of an existing member* (an UPDATE, not a join).
- **Config plane / runtime plane split** keeps each PR reviewable and lets the
  mapping table ship and be populated before enforcement goes live.
