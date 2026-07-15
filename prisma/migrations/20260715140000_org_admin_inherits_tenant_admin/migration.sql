-- Org admins now inherit tenant ADMIN across their org's child tenants,
-- changed from the original read-only AUDITOR. An ORG_ADMIN is a customer
-- administrator who operates their tenants, not merely audits them.
--
-- Backfill: upgrade every AUTO-PROVISIONED membership (tagged with
-- `provisionedByOrgId`) that is still AUDITOR to ADMIN, so existing org
-- admins gain the new role immediately without needing to be re-provisioned.
--
-- Scope is strictly the org-provisioned rows:
--   - `provisionedByOrgId IS NOT NULL` — only rows the org-provisioning
--     engine created; MANUAL memberships (provisionedByOrgId IS NULL) are
--     never touched, preserving any deliberate per-tenant role.
--   - `role = 'AUDITOR'` — the only role the engine ever wrote; leaves any
--     already-elevated row alone.
--
-- OWNER counts are unaffected (AUDITOR → ADMIN), so the
-- last-OWNER guard trigger does not fire.
UPDATE "TenantMembership"
SET "role" = 'ADMIN'
WHERE "provisionedByOrgId" IS NOT NULL
  AND "role" = 'AUDITOR';
