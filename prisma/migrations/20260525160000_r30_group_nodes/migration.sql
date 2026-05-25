-- R30 — Group nodes on the Processes canvas.
--
-- A process node can now belong to a parent "group" node. The
-- parent reference is the parent's per-map `nodeKey` (the
-- frontend-stable id), not the row's cuid `id` — the rest of
-- the graph (edges' sourceKey / targetKey) already references
-- node KEYS, so this keeps the model consistent.
--
-- No FK constraint: the parent must exist in the SAME
-- processMap row-set, which the application enforces at save
-- time (the structural validator in `replaceGraph` already
-- walks the node-key universe; a sibling check verifies any
-- supplied parentNodeKey is present in that universe).
--
-- The partial index speeds the canonical "find all children of
-- this group" query that the frontend rehydration uses + that a
-- future ungroup operation will rely on; the `IS NOT NULL`
-- predicate keeps the index small (typical maps have ≤1 group
-- per dozen nodes).

ALTER TABLE "ProcessNode" ADD COLUMN "parentNodeKey" TEXT;

CREATE INDEX "ProcessNode_processMapId_parentNodeKey_idx"
    ON "ProcessNode" ("processMapId", "parentNodeKey")
    WHERE "parentNodeKey" IS NOT NULL;
