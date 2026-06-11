-- RQ2-6 — breach → remediation task linkage.
-- One nullable soft reference; idempotency is enforced by the
-- conditional-update claim in createBreachRemediationTask (the
-- column only moves NULL → task id once per breach).
ALTER TABLE "RiskAppetiteBreach" ADD COLUMN "remediationTaskId" TEXT;
