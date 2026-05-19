/**
 * R26-PR-C — Proximity auto-bind structural ratchet.
 *
 * The geometry is unit-tested at `tests/unit/proximity-auto-bind`.
 * This ratchet locks the WIRING: the hook is mounted by the
 * canvas, the canvas threads onNodeDrag/onNodeDragStop into
 * xyflow, the preview edge is synthesised from the hook's
 * candidate state, and the ProcessEdge renderer reads `isPreview`
 * to swap to the dashed brand-stroke preview style.
 *
 * Five invariants:
 *   1. `useProximityAutoBind` is exported from the canonical path.
 *   2. The canvas imports + mounts the hook with the current
 *      nodes + edges.
 *   3. The canvas threads `onNodeDrag` + `onNodeDragStop` from
 *      the hook into <ReactFlow>.
 *   4. The canvas synthesises a transient preview edge from the
 *      candidate state and tags it with `data.isPreview: true`.
 *   5. ProcessEdge reads `isPreview` and applies the dashed
 *      brand-stroke styling.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const HOOK_PATH = "src/lib/processes/use-proximity-auto-bind.ts";
const CANVAS_PATH =
    "src/components/processes/PersistedProcessCanvas.tsx";
const EDGE_PATH = "src/components/processes/ProcessEdge.tsx";

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("R26-PR-C — proximity auto-bind hook + wiring", () => {
    describe("hook module", () => {
        it("exists at the canonical path", () => {
            expect(fs.existsSync(path.join(ROOT, HOOK_PATH))).toBe(true);
        });

        const src = read(HOOK_PATH);

        it("exports the hook + the pure finder + the default threshold", () => {
            expect(src).toMatch(/export function useProximityAutoBind\b/);
            expect(src).toMatch(/export function findProximityCandidate\b/);
            expect(src).toMatch(
                /export const DEFAULT_PROXIMITY_THRESHOLD_PX\s*=\s*\d+/,
            );
        });

        it("skips annotation kinds (no handles) on both sides", () => {
            // The hook reads the taxonomy meta to decide whether
            // a node participates. Dropping this rule would mean
            // dragging an annotation auto-binds to anything nearby.
            expect(src).toMatch(/nodeHasHandles/);
            expect(src).toMatch(/NODE_TAXONOMY\[kind\]\.hasHandles/);
        });

        it("never re-creates an existing edge (forward or reverse)", () => {
            // edgeExists must check both directions; a forward-only
            // check would re-bind A→B when an existing B→A edge
            // already covers the pair.
            expect(src).toMatch(/edgeExists/);
            expect(src).toMatch(
                /e\.source === a && e\.target === b/,
            );
            expect(src).toMatch(
                /e\.source === b && e\.target === a/,
            );
        });
    });

    describe("canvas wiring", () => {
        const src = read(CANVAS_PATH);

        it("imports the hook from the canonical path", () => {
            expect(src).toMatch(
                /import\s*\{\s*useProximityAutoBind\s*\}\s*from\s*["']@\/lib\/processes\/use-proximity-auto-bind["']/,
            );
        });

        it("mounts the hook with the current nodes + edges", () => {
            // The hook needs the current nodes/edges to compute
            // the candidate. Passing stale snapshots would mean
            // the candidate keeps targeting nodes that no longer
            // exist or duplicates edges that just landed.
            expect(src).toMatch(
                /useProximityAutoBind\(\s*nodes,\s*edges/,
            );
        });

        it("commits the candidate by appending an edge to setEdges", () => {
            // The hook's `onCommit` callback must mutate edges
            // state. A future PR that drops the callback would
            // make the preview UI work but actually create no
            // edge on mouse-up.
            expect(src).toMatch(/onCommit:\s*handleProximityCommit/);
            expect(src).toMatch(/setEdges\(\(eds\)/);
        });

        it("threads onNodeDrag + onNodeDragStop into <ReactFlow>", () => {
            // Without these props xyflow's drag never invokes the
            // hook and the candidate state stays null forever.
            expect(src).toMatch(
                /onNodeDrag=\{proximity\.onNodeDrag\}/,
            );
            expect(src).toMatch(
                /onNodeDragStop=\{proximity\.onNodeDragStop\}/,
            );
        });

        it("synthesises a preview edge tagged data.isPreview", () => {
            // The preview is what the user SEES — without the
            // tagged synth edge there's no visual feedback and
            // the auto-bind becomes a black-box surprise.
            expect(src).toMatch(/proximity\.candidate/);
            expect(src).toMatch(/PROXIMITY_PREVIEW_ID/);
            expect(src).toMatch(/data:\s*\{\s*isPreview:\s*true\s*\}/);
        });
    });

    describe("ProcessEdge preview styling", () => {
        const src = read(EDGE_PATH);

        it("reads data.isPreview off the edge data", () => {
            expect(src).toMatch(/edgeData\?\.isPreview/);
        });

        it("applies dashed brand-stroke styling when previewing", () => {
            // The dashed stroke is the universal "not yet committed"
            // signal. A future refactor that drops the dash makes
            // the preview indistinguishable from a real edge.
            expect(src).toMatch(/strokeDasharray/);
            expect(src).toMatch(
                /isPreview[\s\S]*?var\(--brand-default\)/,
            );
        });
    });
});
