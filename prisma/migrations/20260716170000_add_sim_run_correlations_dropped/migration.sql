-- PR-L — surface dropped (non-PSD) correlations on the persisted simulation run.
ALTER TABLE "RiskSimulationRun" ADD COLUMN "correlationsDropped" BOOLEAN NOT NULL DEFAULT false;
