# 2026-06-03 — Remove (soft-delete) a tenant from the org admin panel

**Commit:** `<sha> feat(org): remove (soft-delete) a tenant from the org admin panel`

## Design

Org admins can now remove a tenant from the org tenants table. It's a
**soft delete**, not a hard purge:

- Why soft: tenant-scoped tables reference `Tenant` with **no
  `onDelete: Cascade`** on the tenant relation, so a hard
  `prisma.tenant.delete` would fail on FK constraints across ~50 tables;
  and for a compliance product, silently erasing a tenant's audit trail
  is the wrong default. Soft-delete is safe, reversible, and retains the
  data for compliance.

The mechanism is one new column, `Tenant.deletedAt`, plus filtering it
out of every place a tenant is resolved or listed. The **authoritative
gate** is `resolveTenantContext` (every `/t` and `/api/t` request flows
through it): a `deletedAt` tenant throws `notFound`, so a removed tenant
is inaccessible everywhere at once — even with a stale JWT or cached
listing. The listing filters are then cosmetic (hide it), backstopped by
that gate.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/auth.prisma` + `migrations/20260603120000_tenant_soft_delete` | `Tenant.deletedAt` (additive, nullable) |
| `src/lib/tenant-context.ts` | Gate: 404 a deleted tenant; `getDefaultTenantForUser` skips deleted |
| `src/app-layer/repositories/PortfolioRepository.ts` | Org portfolio / tenants table hides deleted |
| `src/app/api/org/[orgSlug]/tenants/route.ts` | Org-switcher tenant list hides deleted |
| `src/app/tenants/page.tsx` | Tenant picker hides deleted |
| `src/auth.ts` | JWT membership claims exclude deleted tenants |
| `src/app-layer/usecases/org-tenants.ts` | `deleteTenantUnderOrg` — org-scoped soft-delete |
| `src/app/api/org/[orgSlug]/tenants/[tenantId]/route.ts` | `DELETE` — ORG_ADMIN (`canManageTenants`) |
| `src/app/org/[orgSlug]/(app)/tenants/TenantsTable.tsx` | "Remove" action + typed-confirmation modal |

## Decisions

- **One authoritative gate.** Filtering `resolveTenantContext` is what
  makes removal *safe* (inaccessible); the listing filters are for UX.
  This mirrors how the codebase treats access — server gate is the
  authority, not the JWT/listing.
- **Memberships left intact.** Deactivating them would trip the
  last-OWNER DB trigger and isn't needed — the gate already denies
  access, and a future restore is trivial (clear `deletedAt`).
- **Org-scoped by construction.** `deleteTenantUnderOrg` looks the
  tenant up by `{ id, organizationId, deletedAt: null }`; a foreign id
  is `notFound`, so an org admin can never reach another org's tenant.
- **Typed-confirmation modal**, per the destructive-action convention
  for top-level entities (not the 5-second undo-toast).
- **Hard purge is deliberately out of scope** — a separate, explicit
  operation if ever needed.
