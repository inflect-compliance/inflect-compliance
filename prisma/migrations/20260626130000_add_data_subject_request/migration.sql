-- CreateEnum
CREATE TYPE "DataSubjectRequestType" AS ENUM ('EXPORT', 'ERASURE');
-- CreateEnum
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "exportUrl" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "DataSubjectRequest_userId_idx" ON "DataSubjectRequest"("userId");
-- CreateIndex
CREATE INDEX "DataSubjectRequest_status_requestedAt_idx" ON "DataSubjectRequest"("status", "requestedAt");
-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
