# 2026-06-08 — Entra Group → IC Role Mapping Engine (EI-2)

**Commit:** `<sha>` feat(auth): Entra group → IC role mapping engine

## Why

EI-1 put the user's AAD groups on the token. EI-2 turns IC roles into a
function of that group membership: add a user to "IC-Compliance-Leads" in Entra
→ they become EDITOR in IC, automatically, no manual invite.

## What

- **`EntraGroupMapping`** model (+ migration + RLS) — `(aadGroupId → icRole /
  customRoleId)` with `priority` + `isActive`, unique per `(tenantId,
  aadGroupId)`. Tenant-scoped, FK-cascaded from the provider.
- **`TenantMembership.provisionedByEntraGroup` + `lastEntraGroupMappingId`** —
  provenance columns mirroring the org-layer `provisionedByOrgId` precedent.
- **`entra-group-evaluator.ts`** — the pure decision core. `pickMapping`:
  active-only, highest `priority`, ties break by **role severity**
  (OWNER>ADMIN>EDITOR>READER>AUDITOR). `evaluateGroupMapping`: match → role;
  no match + `enforceGroupGate` → deny; no match + gate off → null; empty
  groups → null (fail-safe).
- **`entra-group-mapper.ts`** — the write side. First sign-in + match →
  create auto-managed membership; returning auto-managed + change → update;
  + deny → deactivate. **THE INVARIANT:** a `provisionedByEntraGroup = false`
  (manual) membership is never mutated — the privilege-escalation guard.
  Last-OWNER trigger rejections are caught so sign-in never crashes.
- **auth.ts wiring** — the `jwt` callback reconciles the role at sign-in
  (`source: 'claim'`) and on token refresh (`source: 'refresh'`), re-applying
  membership claims so the new role rides the same token. Best-effort — a
  mapping failure never blocks sign-in.
- **Admin CRUD** — `/api/t/[slug]/admin/entra-groups` (+`/[id]`) + a mappings
  manager on the `admin/entra` page.

## Decisions

- **Integration point is the `jwt` callback, not `signIn`** — the roadmap's
  `signIn` snippet reads `token.aadGroups`, but `signIn` runs *before* `jwt`
  where the claim is extracted. The `jwt` path also covers refresh. First-time
  enforce-deny degrades to "no membership created" → `/no-tenant` (a soft deny);
  hardening to a `signIn=false` hard block is left to the EI audit PR.
- **Group-name lookup endpoint deferred** — admins type the display name; the
  evaluator only ever keys off `aadGroupId`, so auto-lookup is cosmetic.
- **DB-backed no-override ratchet lands in EI-4** — EI-2 ships the behavioural
  unit test + a structural ratchet; EI-4 adds the integration-level lock.
