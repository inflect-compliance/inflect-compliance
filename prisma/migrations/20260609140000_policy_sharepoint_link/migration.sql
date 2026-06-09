-- SP-4 — SharePoint document link on Policy (bidirectional sync).
ALTER TABLE "Policy" ADD COLUMN "spDriveId" TEXT,
ADD COLUMN "spItemId" TEXT,
ADD COLUMN "spItemETag" TEXT,
ADD COLUMN "spWebUrl" TEXT,
ADD COLUMN "spSubscriptionId" TEXT;

-- Resolve a policy from a Graph change-notification (driveId + itemId).
CREATE INDEX "Policy_tenantId_spDriveId_spItemId_idx" ON "Policy"("tenantId", "spDriveId", "spItemId");
