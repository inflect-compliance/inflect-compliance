-- Data-residency foundation: declare a Tenant's residency region.
-- DECLARATIVE today (single-region production) — see docs/data-residency.md.

-- CreateEnum
CREATE TYPE "TenantRegion" AS ENUM ('US_EAST_1', 'EU_WEST_1', 'AP_SOUTHEAST_1');

-- AlterTable: backfill-safe — every existing tenant defaults to US_EAST_1
-- (the only operationally-provisioned region today).
ALTER TABLE "Tenant" ADD COLUMN "region" "TenantRegion" NOT NULL DEFAULT 'US_EAST_1';

-- CreateIndex: per-region operational scans.
CREATE INDEX "Tenant_region_idx" ON "Tenant"("region");
