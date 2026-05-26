/**
 * PR-C polish — Unit coverage for `computeForceLayout`. The
 * structural ratchet (`p-polish-c`) locks the wiring; this file
 * pins the BEHAVIOURAL contract:
 *
 *   1. Returns positions keyed by xyflow node id.
 *   2. Skips annotation nodes (parity with the dagre engine).
 *   3. Respects `nodeIdsFilter` — only filtered nodes get positions.
 *   4. Preserves the selection centroid when `nodeIdsFilter` is set
 *      (uses the same `finaliseSubsetPositions` helper as dagre).
 *
 * elkjs itself is mocked via `jest.mock` so the test runs in
 * single-digit milliseconds; the real layout engine is exercised
 * by Playwright at integration time.
 */

jest.mock("elkjs/lib/elk.bundled.js", () => {
    return {
        __esModule: true,
        default: class FakeELK {
            // Return a deterministic layout — each child gets x = i*100, y = i*60.
            // Real ELK runs a spring simulation; the fake gives us a
            // predictable shape we can assert against.
            async layout(graph: {
                children?: Array<{ id: string; width: number; height: number }>;
            }) {
                const children = (graph.children ?? []).map((c, i) => ({
                    ...c,
                    x: i * 100,
                    y: i * 60,
                }));
                return { ...graph, children };
            }
        },
    };
});

import { computeForceLayout } from "@/lib/processes/canvas-auto-layout";
import type { Edge, Node } from "@xyflow/react";

function n(id: string, x: number, y: number, kind = "processStep"): Node {
    return {
        id,
        type: "processStep",
        position: { x, y },
        data: { label: id, kind },
    };
}

function e(source: string, target: string): Edge {
    return { id: `${source}-${target}`, source, target };
}

describe("computeForceLayout", () => {
    it("returns positions for every participating node", async () => {
        const nodes = [n("a", 0, 0), n("b", 100, 0), n("c", 200, 0)];
        const edges = [e("a", "b"), e("b", "c")];
        const { positions } = await computeForceLayout(nodes, edges);
        expect(Object.keys(positions).sort()).toEqual(["a", "b", "c"]);
    });

    it("skips annotation nodes", async () => {
        const nodes = [n("a", 0, 0), n("ann", 50, 50, "annotation")];
        const { positions } = await computeForceLayout(nodes, []);
        expect(positions.a).toBeDefined();
        expect(positions.ann).toBeUndefined();
    });

    it("returns positions only for ids in the filter", async () => {
        const nodes = [n("a", 0, 0), n("b", 100, 0), n("c", 200, 0)];
        const filter = new Set(["b", "c"]);
        const { positions } = await computeForceLayout(nodes, [], filter);
        expect(Object.keys(positions).sort()).toEqual(["b", "c"]);
    });

    it("preserves the selection centroid when nodeIdsFilter is set", async () => {
        // Selection sits at avg (1000, 1000). Without centroid
        // preservation the fake ELK would dump them near (0, 0)
        // and (100, 60).
        const nodes = [
            n("a", 0, 0),
            n("b", 900, 1000),
            n("c", 1100, 1000),
        ];
        const filter = new Set(["b", "c"]);
        const { positions } = await computeForceLayout(nodes, [], filter);
        const cx = (positions.b.x + positions.c.x) / 2;
        const cy = (positions.b.y + positions.c.y) / 2;
        // Original centroid: ((900+1100)/2, (1000+1000)/2) = (1000, 1000).
        expect(Math.abs(cx - 1000)).toBeLessThan(50);
        expect(Math.abs(cy - 1000)).toBeLessThan(50);
    });
});
