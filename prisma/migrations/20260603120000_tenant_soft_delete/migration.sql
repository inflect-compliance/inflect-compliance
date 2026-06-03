-- Soft-delete for tenants (org admin panel "remove tenant").
-- Additive, nullable column — safe, no backfill, no downtime.
-- When set, the tenant is filtered out of tenant resolution + all
-- listings (see getTenantContext, portfolio, tenant picker, JWT claims),
-- making it inaccessible while the underlying data is retained.
ALTER TABLE "Tenant" ADD COLUMN "deletedAt" TIMESTAMP(3);
