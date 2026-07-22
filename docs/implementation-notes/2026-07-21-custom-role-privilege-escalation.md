# 2026-07-21 — Custom roles: you cannot grant what you don't hold

**Commit:** `<pending> fix(custom-roles): block granting permissions the grantor does not hold`

## The hole

Custom roles were the one path in the product where a permission set is
**authored by hand** rather than derived from the `Role` enum — and
therefore the one path that could hand out *more* authority than its
author has.

`admin.tenant_lifecycle` and `admin.owner_management` are the two flags
that separate OWNER from ADMIN. Per the access-control design they gate
deleting the tenant, rotating the tenant DEK, transferring ownership, and
inviting/removing OWNERs. On the enum path that separation is enforced at
compile time — `getPermissionsForRole('ADMIN').admin.tenant_lifecycle` is
`false` *by type*.

The custom-role path bypassed it completely:

1. Every custom-role entrypoint is gated on `assertCanManageMembers` →
   `assertCanAdmin`, which an **ADMIN** satisfies.
2. `createCustomRole` ran `validatePermissionsJson`, which checks the
   JSON's **shape** — domains present, actions boolean — and nothing about
   whether the author holds what they're writing.
3. `parsePermissionsJson` merges that JSON *over* the base-role defaults,
   and `PERMISSION_SCHEMA.admin` includes both OWNER-only flags. So the
   merge happily produces `tenant_lifecycle: true`.
4. `assignCustomRole` verified only that the role existed, was active, and
   belonged to the tenant.

So an ADMIN could author a role holding the OWNER-only flags, assign it
to **themselves**, and hold OWNER powers on the next request.

Blocking authorship alone would not have closed it: an over-privileged
role that already exists — seeded, or authored by a legitimate OWNER —
could still simply be *assigned*. Both halves had to be guarded.

## The fix

`permissionsExceeding(granted, held)` in `src/lib/permissions.ts` returns
the `domain.action` keys that are `true` in the set being handed out while
not `true` for the person handing it out. It lives beside
`PERMISSION_SCHEMA` so it iterates the same source of truth the merge does
— a new permission is covered automatically.

`assertGrantWithinOwnAuthority` applies it at **all three** entrypoints:

| entrypoint | what is checked |
| --- | --- |
| `createCustomRole` | the submitted `permissionsJson` over its `baseRole` |
| `updateCustomRole` | the **resulting** role — `input.permissionsJson ?? existing.permissionsJson` over `input.baseRole ?? existing.baseRole` |
| `assignCustomRole` | the target role's own resolved permissions |

The update case is deliberately evaluated against the *result*, not the
submitted field: a partial update can raise authority through either half
— new permissions over the old base role, or a higher base role under the
existing permissions.

Granting **less** than you hold stays allowed — revoking is not
escalation — and unassigning (`null`) grants nothing, so it is untouched.

## Decisions

- **Guard the resolved set, not the raw JSON.** The JSON is a partial
  overlay; only the post-merge set reflects what the holder will actually
  get. Checking the overlay would miss authority inherited from
  `baseRole`.
- **Name the offending permissions in the error.** The AUTHZ_DENIED
  convention of not echoing permission keys protects against *probing
  hidden routes*. This is different: an admin is editing their own
  tenant's role config and needs to know which entry to correct. A
  vague failure would make the feature unusable.
- **Derive from `PERMISSION_SCHEMA`, don't hardcode the two OWNER flags.**
  Naming `tenant_lifecycle` / `owner_management` explicitly would fix
  today's escalation and silently miss the next privileged flag added.
- **No change to `VALID_BASE_ROLES`.** It already excludes OWNER; the
  escalation ran through `permissionsJson`, not the base role.
