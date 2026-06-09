-- SP-3 — remote accessible URL on a sync mapping (e.g. SharePoint webUrl).
ALTER TABLE "IntegrationSyncMapping" ADD COLUMN "sourceUrl" TEXT;
