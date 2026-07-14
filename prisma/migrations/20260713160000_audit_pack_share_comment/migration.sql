-- feat/auditor-return-channel — return channel that closes the audit-pack
-- sharing loop. A token-bearing external auditor can send messages BACK to
-- the tenant (comment / request more evidence / raise a finding or question).
-- Single table with a `kind` discriminator serves all four. `body` is
-- auditor free text encrypted at rest via the Epic B manifest.

-- CreateEnum
CREATE TYPE "AuditShareCommentKind" AS ENUM ('COMMENT', 'EVIDENCE_REQUEST', 'FINDING', 'QUESTION');

-- CreateEnum
CREATE TYPE "AuditShareCommentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "AuditPackShareComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditPackId" TEXT NOT NULL,
    "auditPackShareId" TEXT NOT NULL,
    "auditPackItemId" TEXT,
    "kind" "AuditShareCommentKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "status" "AuditShareCommentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "AuditPackShareComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditPackShareComment_tenantId_idx" ON "AuditPackShareComment"("tenantId");
CREATE INDEX "AuditPackShareComment_tenantId_auditPackId_idx" ON "AuditPackShareComment"("tenantId", "auditPackId");
CREATE INDEX "AuditPackShareComment_auditPackId_idx" ON "AuditPackShareComment"("auditPackId");
CREATE INDEX "AuditPackShareComment_auditPackShareId_idx" ON "AuditPackShareComment"("auditPackShareId");
CREATE INDEX "AuditPackShareComment_auditPackItemId_idx" ON "AuditPackShareComment"("auditPackItemId");

-- AddForeignKey: tenant (RESTRICT); pack (CASCADE); share (CASCADE); item (SET NULL); resolvedBy (SET NULL)
ALTER TABLE "AuditPackShareComment" ADD CONSTRAINT "AuditPackShareComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditPackShareComment" ADD CONSTRAINT "AuditPackShareComment_auditPackId_fkey" FOREIGN KEY ("auditPackId") REFERENCES "AuditPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditPackShareComment" ADD CONSTRAINT "AuditPackShareComment_auditPackShareId_fkey" FOREIGN KEY ("auditPackShareId") REFERENCES "AuditPackShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditPackShareComment" ADD CONSTRAINT "AuditPackShareComment_auditPackItemId_fkey" FOREIGN KEY ("auditPackItemId") REFERENCES "AuditPackItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditPackShareComment" ADD CONSTRAINT "AuditPackShareComment_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security for the new tenant table (canonical trio).
-- New tables inherit app_user grants via ALTER DEFAULT PRIVILEGES.
-- tenantId is NOT nullable → standard symmetric single tenant_isolation policy.
ALTER TABLE "AuditPackShareComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditPackShareComment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditPackShareComment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY tenant_isolation_insert ON "AuditPackShareComment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
CREATE POLICY superuser_bypass ON "AuditPackShareComment"
    USING (current_setting('role') != 'app_user');
