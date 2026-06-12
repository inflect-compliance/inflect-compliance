-- RQ3-1 — persist VaR-80 alongside the existing percentile columns so
-- the simulated LEC can mark P50/P80/P95 without re-running.
ALTER TABLE "RiskSimulationRun" ADD COLUMN "portfolioP80" DOUBLE PRECISION;
