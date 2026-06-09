-- SP-F1 — record which SharePoint connection backs a policy's link.
ALTER TABLE "Policy" ADD COLUMN "spConnectionId" TEXT;
