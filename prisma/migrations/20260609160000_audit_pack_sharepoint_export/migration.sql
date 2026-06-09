-- SP-5 — SharePoint export metadata on a (frozen) AuditPack.
ALTER TABLE "AuditPack" ADD COLUMN "spExportItemId" TEXT,
ADD COLUMN "spExportWebUrl" TEXT,
ADD COLUMN "spExportedAt" TIMESTAMP(3);
