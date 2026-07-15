-- EP-4 — index backing the tenant-wide evidence retention / KPI aggregate.
--
-- `getEvidenceRetentionMetrics` computes authoritative status + expiry
-- bucket counts over the FULL tenant dataset (not the ≤100-row SSR page):
-- a groupBy(status) plus a handful of count() queries keyed on
-- (tenantId, status, expiredAt). This composite covers the groupBy and the
-- expired/expiring bucket scans so the aggregate stays a bounded, indexed
-- read as a tenant accumulates evidence.
CREATE INDEX "Evidence_tenantId_status_expiredAt_idx" ON "Evidence"("tenantId", "status", "expiredAt");
