/**
 * R29 — Multi-select / perf / collab-seam ratchet.
 *
 * The next four genuine deltas after R28:
 *
 *   1. Multi-select alignment + distribute helpers. Pure
 *      functions in `canvas-alignment.ts`; toolbar UI surfaces
 *      ONLY when ≥2 nodes selected (≥3 for distribute).
 *
 *   2. Bulk delete explicit toolbar action — Delete key already
 *      works via xyflow's selection-aware change pipeline; the
 *      button adds discoverability when ≥2 selected.
 *
 *   3. Performance — `onlyRenderVisibleElements` on the
 *      ReactFlow root + `memo()` on the typed node renderer
 *      (kept from R25-PR-C, locked here so a future "drop the
 *      memo" PR fails CI).
 *
 *   4. Collab-ready seam — `useCanvasChangeEmitter` hook +
 *      `CanvasChangeEvent` type. Future collab / awareness
 *      layers subscribe to a STRUCTURED event instead of
 *      inferring from xyflow's render-driven changes.
 *
 * The R28 ratchets stay untouched.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R29 — multi-select / perf / collab seam", () => {
    describe("canvas-alignment helpers", () => {
        const src = read("src/lib/processes/canvas-alignment.ts");

        it("exports alignNodes + distributeNodes", () => {
            expect(src).toMatch(/export function alignNodes/);
            expect(src).toMatch(/export function distributeNodes/);
        });

        it("exposes the six alignment axes + two distribute axes", () => {
            for (const axis of [
                "left",
                "right",
                "center-x",
                "top",
                "bottom",
                "center-y",
            ]) {
                expect(src).toMatch(new RegExp(`["']${axis}["']`));
            }
            for (const axis of ["horizontal", "vertical"]) {
                expect(src).toMatch(new RegExp(`["']${axis}["']`));
            }
        });

        it("no-ops below the action's minimum selection count", () => {
            // Align needs ≥2; distribute needs ≥3.
            expect(src).toMatch(/selected\.length < 2/);
            expect(src).toMatch(/selected\.length < 3/);
        });

        it("returns the input array reference on no-op (memo-friendly)", () => {
            // The early-out path returns the original `nodes`
            // reference so React.memo downstream skips the
            // re-render entirely.
            expect(src).toMatch(/return nodes;/);
        });
    });

    describe("canvas-change-events emitter", () => {
        const src = read("src/lib/processes/canvas-change-events.ts");

        it("exports the hook + typed event surface", () => {
            expect(src).toMatch(/export function useCanvasChangeEmitter/);
            expect(src).toMatch(/export interface CanvasChangeEvent/);
            expect(src).toMatch(/CanvasChangeEventType/);
        });

        it("covers the 8 canonical event types", () => {
            for (const ev of [
                "node.add",
                "node.remove",
                "node.move",
                "node.update",
                "edge.add",
                "edge.remove",
                "edge.update",
                "graph.replace",
            ]) {
                expect(src).toMatch(new RegExp(`["']${ev}["']`));
            }
        });

        it("snapshots subscriber set BEFORE iterating dispatch", () => {
            // A subscriber that unsubscribes itself during
            // dispatch must not break the iteration. The
            // canonical fix is to snapshot to an array first.
            expect(src).toMatch(/Array\.from\(subsRef\.current\)/);
        });

        it("swallows subscriber throws so siblings still receive", () => {
            // A misbehaving subscriber must not block the others.
            // Try/catch around the dispatch loop is the contract.
            expect(src).toMatch(/try \{[\s\S]{0,200}sub\(event\)[\s\S]{0,200}catch/);
        });
    });

    describe("PersistedProcessCanvas — wiring", () => {
        const src = read(
            "src/components/processes/PersistedProcessCanvas.tsx",
        );

        it("imports + uses the alignment helpers + emitter", () => {
            expect(src).toMatch(/alignNodes/);
            expect(src).toMatch(/distributeNodes/);
            expect(src).toMatch(/useCanvasChangeEmitter/);
        });

        it("registers handleAlign / handleDistribute / handleBulkDelete", () => {
            expect(src).toMatch(/const handleAlign = useCallback/);
            expect(src).toMatch(/const handleDistribute = useCallback/);
            expect(src).toMatch(/const handleBulkDelete = useCallback/);
        });

        it("passes onlyRenderVisibleElements to ReactFlow", () => {
            // The perf prop is one of the cheapest wins for
            // medium-large graphs; locked here so a future
            // "simplify" PR can't drop it silently.
            expect(src).toMatch(/onlyRenderVisibleElements/);
        });

        it("renders the multi-select toolbar only when ≥2 nodes selected", () => {
            expect(src).toMatch(/selectionCount >= 2/);
            expect(src).toMatch(/data-multi-select-toolbar="true"/);
            // Distribute requires ≥3 — the gate is nested so the
            // buttons appear only when meaningful.
            expect(src).toMatch(/selectionCount >= 3/);
        });

        it("toolbar carries the eight alignment/distribute test ids + bulk delete", () => {
            for (const id of [
                "align-left-btn",
                "align-center-x-btn",
                "align-right-btn",
                "align-top-btn",
                "align-center-y-btn",
                "align-bottom-btn",
                "distribute-h-btn",
                "distribute-v-btn",
                "bulk-delete-btn",
            ]) {
                expect(src).toMatch(new RegExp(`data-testid="${id}"`));
            }
        });

        it("bulk delete strips edges that reference removed nodes", () => {
            // xyflow does this on Delete key; the manual path
            // needs to mirror so the toolbar action doesn't
            // leave dangling edges.
            expect(src).toMatch(
                /eds\.filter\(\(e\) => !ids\.has\(e\.source\) && !ids\.has\(e\.target\)\)/,
            );
        });
    });

    describe("ProcessTypedNode — render memoisation locked", () => {
        const src = read("src/components/processes/ProcessTypedNode.tsx");

        it("exports the renderer wrapped in React.memo", () => {
            expect(src).toMatch(
                /export const ProcessTypedNode = memo\(ProcessTypedNodeImpl\)/,
            );
        });
    });
});
