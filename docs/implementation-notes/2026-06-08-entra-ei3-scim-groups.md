# 2026-06-08 — SCIM 2.0 Groups Provisioning (EI-3)

**Commit:** `<sha>` feat(scim): SCIM 2.0 Groups push provisioning

## Why

EI-2's claim path is pull-based — a user offboarded from an AAD group keeps
their IC role until their next token refresh (potentially hours). SCIM Groups
push is event-driven: Entra calls IC the moment a group membership changes,
enabling near-real-time deprovisioning. The two are complementary — claims are
the safety net, SCIM is the fast path.

## What

- **`ScimGroup`** model (+ migration + RLS) — one row per Entra group pushed to
  IC; mirrors `externalId` (AAD Object ID) + `displayName` + `memberIds[]`.
- **`/api/scim/v2/Groups`** (GET/POST) + **`/[id]`** (GET/PUT/PATCH/DELETE) —
  RFC 7644, existing `TenantScimToken` bearer auth (unchanged from Users).
- **`scim-groups.ts`** — the PatchOp processor. `add`/`remove members` resolve
  SCIM member values (AAD oid) → IC `User.id` via `UserIdentityLink`, then
  **reconcile each affected user through `applyEntraGroupMapping`
  (`source: 'scim'`)** — so a SCIM push creates/updates/deactivates the
  `TenantMembership` immediately, honouring the same EI-2 invariant (manual
  memberships untouched). `replace displayName` syncs the linked
  `EntraGroupMapping.aadGroupName`. `DELETE` deactivates the role mapping.
- `ServiceProviderConfig` already declared `patch` + `filter` support — generic
  enough for Groups, no change needed.

## Decisions

- **Reconcile from the full group set, not the delta.** A member add/remove
  recomputes the affected user's membership across ALL their `ScimGroup`s →
  derives their `aadGroups` → evaluates. This keeps priority/severity correct
  (a removal from one group still leaves them in others) rather than naively
  trusting the single-op delta.
- **RLS without nesting.** `ScimGroup` is FORCE-RLS'd, so its reads/writes run
  in `runInTenantContext`. Membership reconciliation runs AFTER the group
  mutation commits (outside that context) so `applyEntraGroupMapping` owns its
  own tenant context — no nested transactions.
- **`scim-groups.ts` is no-direct-prisma-exempt** like `scim-users.ts` — the
  SCIM layer runs under bearer auth with no session; the lone default-prisma
  use is the `UserIdentityLink` resolver.
