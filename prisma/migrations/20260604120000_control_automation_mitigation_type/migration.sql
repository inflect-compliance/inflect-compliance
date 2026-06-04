-- Control automation + mitigation classification (detail-page batch
-- items 5/6). Two new nullable enum columns on Control; no backfill.

CREATE TYPE "ControlAutomationType" AS ENUM ('AUTOMATED', 'MANUAL', 'IT_DEPENDENT_MANUAL');
CREATE TYPE "ControlMitigationType" AS ENUM ('PREVENTIVE', 'DETECTIVE', 'DETERRENT', 'CORRECTIVE', 'COMPENSATING');

ALTER TABLE "Control" ADD COLUMN "automationType" "ControlAutomationType";
ALTER TABLE "Control" ADD COLUMN "mitigationType" "ControlMitigationType";
