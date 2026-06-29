-- Cascade ControlTestRun when its ControlTestPlan is hard-deleted (purge).
ALTER TABLE "ControlTestRun" DROP CONSTRAINT "ControlTestRun_testPlanId_fkey";
ALTER TABLE "ControlTestRun" ADD CONSTRAINT "ControlTestRun_testPlanId_fkey"
    FOREIGN KEY ("testPlanId") REFERENCES "ControlTestPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
