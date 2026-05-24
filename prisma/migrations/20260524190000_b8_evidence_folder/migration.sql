-- B8 follow-up — Evidence folders.
--
-- Mirrors the VendorDocument.folder pattern landed in
-- 20260524170000_b8_folders_and_framework_link. Evidence is the
-- bigger "documents" surface; the original B8 scoped too narrowly
-- to VendorDocument. This migration brings parity.

ALTER TABLE "Evidence" ADD COLUMN "folder" TEXT;

CREATE INDEX "Evidence_tenantId_folder_idx"
    ON "Evidence" ("tenantId", "folder");
