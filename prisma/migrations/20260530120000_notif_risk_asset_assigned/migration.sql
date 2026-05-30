-- 2026-05-30 — assignment alerts for risks + assets.
--
-- Add `RISK_ASSIGNED` + `ASSET_ASSIGNED` to the `NotificationType`
-- enum. Wired by `updateRisk` / `updateAsset` so the new assignee
-- ("Assigned to" / ownerUserId) sees an in-app bell notification the
-- moment ownership changes. Mirrors the CONTROL_ASSIGNED shape.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RISK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ASSET_ASSIGNED';
