# 2026-06-10 — EI-3 SCIM 2.0 Groups push provisioning (re-implemented)

**Context:** the original EI-3 PR (#934) predated the RQ work and was built on a
since-superseded EI-2 (`EntraGroupMapping`). Re-implemented fresh on the current
`TenantEntraGroupMapping` model + the shared `syncEntraMembershipRole` engine.

## Design
- **`ScimGroup`** registry (id, tenantId, externalId, displayName, memberIds[],
  membersJson) + RLS. Mirrors an Entra group pushed via SCIM.
- **Endpoints** `/api/scim/v2/Groups` (GET/POST) + `/[id]` (GET/PUT/PATCH/DELETE),
  RFC 7644 PatchOp (member add/remove + displayName replace), tenant-scoped SCIM
  bearer auth (`authenticateScimRequest`, same as Users).
- **Reconciliation:** member changes resolve SCIM externalIds → IC user ids via
  `UserIdentityLink`, then reconcile each affected user's role through
  `syncEntraMembershipRole({ userId, tenantId, aadGroups })` — the EI-2 engine —
  for near-real-time (de)provisioning, complementing the sign-in claim path.

## Decisions
- Reuses the shared engine + model instead of the stale branch's evaluator/mapper
  (both superseded by main's `entra-role-mapping` / `entra-group-sync`).
- PATCH displayName syncs the cached `TenantEntraGroupMapping.aadGroupName` (UI
  only). DELETE removes the SCIM group + reconciles ex-members; the admin-curated
  role mapping persists (the current model has no active flag).
