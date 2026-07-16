-- Link scanner findings to the asset their scanned target resolved to.
-- Nullable — unresolved targets stay unlinked (logged, not guessed). SetNull
-- on asset delete so the finding survives its asset's removal.
ALTER TABLE "ScannerFinding" ADD COLUMN "assetId" TEXT;

CREATE INDEX "ScannerFinding_tenantId_assetId_idx" ON "ScannerFinding"("tenantId", "assetId");

ALTER TABLE "ScannerFinding" ADD CONSTRAINT "ScannerFinding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
