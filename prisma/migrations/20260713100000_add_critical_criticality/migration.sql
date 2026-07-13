-- Unify asset criticality — step 1 of 2.
--
-- Add CRITICAL to the Asset `Criticality` enum. Postgres forbids USING a
-- freshly-added enum value in the SAME transaction that adds it, and Prisma
-- wraps each migration file in one transaction — so the backfill that assigns
-- 'CRITICAL' lives in the SEPARATE follow-up migration
-- (20260713100100_backfill_asset_criticality). This file adds the value only.
ALTER TYPE "Criticality" ADD VALUE IF NOT EXISTS 'CRITICAL';
