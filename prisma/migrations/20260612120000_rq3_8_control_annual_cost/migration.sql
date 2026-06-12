-- RQ3-8 — Mitigation ROI. Adds Control.annualCost (Float, nullable)
-- so an owner can price a control once and the ROI surfaces show
-- "this control buys €X reduction for €Y/yr (ROI Z×)". Null until
-- priced — the ROI math returns an honest `NO_COST` verdict, never
-- a fabricated number.

ALTER TABLE "Control" ADD COLUMN "annualCost" DOUBLE PRECISION;
