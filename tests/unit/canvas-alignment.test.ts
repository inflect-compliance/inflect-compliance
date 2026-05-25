/**
 * R29 — Canvas alignment unit tests.
 *
 * Pure math for the multi-select alignment + distribute helpers.
 * The functions are deterministic on the inputs, so a small
 * fixture suite catches refactor breakage cheaply.
 */
import type { Node } from "@xyflow/react";
import {
    alignNodes,
    distributeNodes,
} from "@/lib/processes/canvas-alignment";

function n(id: string, x: number, y: number, w = 100, h = 50): Node {
    return {
        id,
        position: { x, y },
        // Cast: xyflow types `measured` as optional + readable.
        measured: { width: w, height: h },
        data: {},
    } as unknown as Node;
}

describe("alignNodes", () => {
    const nodes = [n("a", 10, 100), n("b", 50, 200), n("c", 200, 50)];

    it("no-op with fewer than 2 selected", () => {
        expect(alignNodes(nodes, new Set(["a"]), "left")).toBe(nodes);
    });

    it("align left snaps every selected to the leftmost x", () => {
        const out = alignNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "left",
        );
        expect(out[0].position.x).toBe(10);
        expect(out[1].position.x).toBe(10);
        expect(out[2].position.x).toBe(10);
    });

    it("align right snaps every selected to the rightmost edge", () => {
        // c is rightmost at x=200, w=100 → right edge 300. The
        // others should align so their right edge sits at 300.
        const out = alignNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "right",
        );
        expect(out[0].position.x).toBe(200); // 300 - 100
        expect(out[1].position.x).toBe(200);
        expect(out[2].position.x).toBe(200);
    });

    it("align top snaps every selected to the topmost y", () => {
        const out = alignNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "top",
        );
        expect(out[0].position.y).toBe(50);
        expect(out[1].position.y).toBe(50);
        expect(out[2].position.y).toBe(50);
    });

    it("centre-x averages the centres, then computes per-node offset", () => {
        // Centres on x: a@60, b@100, c@250 → avg 136.666..., so
        // each node sits at avg - w/2 = 86.666... (w=100 for all).
        const out = alignNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "center-x",
        );
        // Compare with a small tolerance — the math is exact but
        // any rounding inside the helper would surface here.
        for (const node of out) {
            expect(Math.abs(node.position.x - (60 + 100 + 250) / 3 + 50)).toBeLessThan(1e-6);
        }
    });

    it("non-selected nodes are returned by reference", () => {
        // Untouched entries share references with the input —
        // memo downstream depends on this.
        const out = alignNodes(nodes, new Set(["a", "b"]), "left");
        expect(out[2]).toBe(nodes[2]);
    });
});

describe("distributeNodes", () => {
    it("no-op with fewer than 3 selected", () => {
        const nodes = [n("a", 0, 0), n("b", 200, 0)];
        expect(distributeNodes(nodes, new Set(["a", "b"]), "horizontal")).toBe(
            nodes,
        );
    });

    it("horizontal: middle nodes redistribute to equal spacing", () => {
        // Three nodes at x=0/40/200 (all w=100). Sorted by x:
        // first centre = 50, last centre = 250. Span 200, step 100.
        // Middle target centre = 150 → x = 100.
        const nodes = [
            n("a", 0, 0),
            n("b", 40, 0),
            n("c", 200, 0),
        ];
        const out = distributeNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "horizontal",
        );
        // Endpoints unchanged.
        expect(out[0].position.x).toBe(0);
        expect(out[2].position.x).toBe(200);
        // Middle redistributed.
        expect(out[1].position.x).toBe(100);
    });

    it("vertical: middle nodes redistribute along y", () => {
        const nodes = [
            n("a", 0, 0),
            n("b", 0, 30),
            n("c", 0, 200, 100, 50),
        ];
        const out = distributeNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "vertical",
        );
        // a centres at 25, c centres at 225. Step = 100. b
        // targets centre 125 → y = 100 (h=50).
        expect(out[0].position.y).toBe(0);
        expect(out[2].position.y).toBe(200);
        expect(out[1].position.y).toBe(100);
    });

    it("sort order is by leading axis coordinate, not selection order", () => {
        // Nodes added in non-spatial order; the sort sorts them
        // by x so the "first" and "last" are the leftmost / right-
        // most, not the first/last in the selection set.
        const nodes = [
            n("c", 200, 0),
            n("a", 0, 0),
            n("b", 40, 0),
        ];
        const out = distributeNodes(
            nodes,
            new Set(["a", "b", "c"]),
            "horizontal",
        );
        // The endpoints are a (x=0) + c (x=200); b is the middle.
        const a = out.find((n) => n.id === "a")!;
        const b = out.find((n) => n.id === "b")!;
        const c = out.find((n) => n.id === "c")!;
        expect(a.position.x).toBe(0);
        expect(c.position.x).toBe(200);
        expect(b.position.x).toBe(100);
    });
});
