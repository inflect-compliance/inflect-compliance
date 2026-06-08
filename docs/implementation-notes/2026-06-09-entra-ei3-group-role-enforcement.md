# 2026-06-09 — Entra group → IC-role enforcement, runtime plane (EI-3)

**Commit:** `<sha>` feat(auth): Entra group → IC-role enforcement at sign-in (EI-3)

## Why

EI-1 put the user's AAD groups on the token; EI-2 stored the per-tenant
`aadGroupId → role` mappings. EI-3 is where they meet at runtime: at sign-in,
turn group membership into an actual IC role, and make the EI-1 `enforceGroupGate`
toggle (shipped but inert until now) real.

## Design

`syncEntraMembershipRole({ userId, tenantId, aadGroups })` in
`src/lib/auth/entra-group-sync.ts` runs from the `microsoft-entra-id` branch of
the `jwt` callback, **scoped to the primary (active) tenant**:

1. Load the tenant's mappings. None → no-op.
2. Load the user's ACTIVE membership. **OWNER → immune** (return early): a
   mapping must never demote or gate-lock-out a tenant owner, and the last-OWNER
   guard would reject the demotion anyway.
3. `resolveRoleFromGroups` (EI-2) → winning role + matched groups.
4. **Gate:** if `enforceGroupGate` and zero groups matched → `gateDenied`.
5. Otherwise **sync**: if a role mapped and differs from the current membership
   role, `UPDATE` the membership role and write a `MEMBER_ROLE_CHANGED` audit row
   (`source: entra_group_sync`).

The decision is applied to the JWT by the pure `applyEntraSyncToToken`:
- **synced** → set `token.role` + the matching `memberships[]` entry.
- **gate denied** → drop the gated tenant from `memberships`, set
  `token.error = 'EntraGroupGateDenied'`, and recompute the primary claims from
  the remaining memberships (or no-tenant / READER). The user lands on
  `/no-tenant` for that tenant but keeps any other tenants — enforcement is via
  the membership/slug claims the middleware already gates on (`token.error` is an
  inert diagnostic flag; neither the session callback nor middleware act on it).

Splitting the impure DB/audit work (`syncEntraMembershipRole`, injectable `db`)
from the pure token mutation (`applyEntraSyncToToken`) keeps both unit-testable
without standing up NextAuth.

One `auth.entra.role_sync` metric per sign-in (outcome: synced / unchanged /
gate_denied / no_membership / owner_immune / no_match / no_mappings). A
`gate_denied` spike = a tenant's gate is locking users out (usually a
misconfigured mapping).

## Files

| File | Role |
| --- | --- |
| `src/lib/auth/entra-group-sync.ts` | **New.** `syncEntraMembershipRole` (DB + audit + metric) + pure `applyEntraSyncToToken`. |
| `src/auth.ts` | jwt callback delegates the entra-id branch to the sync (best-effort; never blocks sign-in). |
| `src/lib/observability/metrics.ts` | **New recorder** `recordEntraRoleSync` + header doc. |
| `tests/guards/entra-ei3-enforcement.test.ts` | **New ratchet.** Locks wiring + OWNER immunity + UPDATE-not-create. |

## Decisions

- **Sync only ever raises/sets to a matched role — it never demotes a no-match
  user.** Stripping a role because a user dropped out of all mapped groups is
  surprising and risky; the gate is the intended tool for *denying access*. A
  no-match with the gate off leaves the existing role untouched.
- **No membership creation.** EI-3 only `UPDATE`s an existing ACTIVE membership;
  creation stays on the Epic 1 allowlisted paths (invite / SSO-JIT / SCIM), so
  the no-auto-join invariant is untouched (and the ratchet asserts the module
  never calls `tenantMembership.create/upsert/createMany`).
- **OWNER immunity** is checked *before* both sync and gate — the one role a
  group can neither grant (EI-2 schema) nor take away.
- **Primary-tenant scope.** The session is scoped to one active tenant; syncing
  that tenant keeps the change bounded and the JWT consistent. Per-tenant sync
  across every membership is a possible future extension.
- **Best-effort, fail-open.** Both the sync call (wrapped in the callback) and
  its audit write are guarded — an error logs and is swallowed; sign-in is never
  blocked by the enforcement path.
