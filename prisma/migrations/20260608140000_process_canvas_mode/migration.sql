-- VR-2 — canvas mode discriminator on ProcessMap (visual rule editor).
CREATE TYPE "ProcessCanvasMode" AS ENUM ('DOCUMENT', 'AUTOMATION');

ALTER TABLE "ProcessMap"
  ADD COLUMN "canvasMode" "ProcessCanvasMode" NOT NULL DEFAULT 'DOCUMENT';
