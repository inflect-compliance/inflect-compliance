-- H2 — fail-closed check semantics. A check whose applicable population is empty
-- (or whose collector returned no parsed controls) is NOT_APPLICABLE, distinct
-- from PASSED: it must not close findings or write APPROVED evidence.
ALTER TYPE "IntegrationExecutionStatus" ADD VALUE IF NOT EXISTS 'NOT_APPLICABLE';
