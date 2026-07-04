/**
 * Unit tests for the pure canvas auto-layout engine (Epic P4).
 *
 * `computeAutoLayout` (dagre, sync) and `computeForceLayout`
 * (elkjs, async) take nodes + edges and return new positions.
 * They are deterministic-enough for structural-invariant assertions
 * (participation, centroid preservation, top-left conversion).
 */
import {
    computeAutoLayout,
    computeForceLayout,
    type AutoLayoutDirection,
} from "@/lib/processes/canvas-auto-layout";
import type { Edge, Node } from "@xyflow/react";

function makeNode(
    id: string,
    x: number,
    y: number,
    opts: {
        kind?: string;
        width?: number;
        height?: number;
        styleWidth?: number;
        styleHeight?: number;
    } = {},
): Node {
    const n: Node = {
        id,
        position: { x, y },
        data: opts.kind ? { kind: opts.kind } : {},
    } as Node;
    if (opts.width !== undefined) (n as { width?: number }).width = opts.width;
    if (opts.height !== undefined)
        (n as { height?: number }).height = opts.height;
    if (opts.styleWidth !== undefined || opts.styleHeight !== undefined) {
        (n as { style?: unknown }).style = {
            width: opts.styleWidth,
            height: opts.styleHeight,
        };
    }
    return n;
}

function edge(id: string, source: string, target: string): Edge {
    return { id, source, target } as Edge;
}

describe("computeAutoLayout (dagre)", () => {
    it("returns an empty positions map for no nodes", () => {
        const res = computeAutoLayout([], [], "LR");
        expect(res.positions).toEqual({});
    });

    it("lays out a single node (top-left converted)", () => {
        const nodes = [makeNode("a", 0, 0)];
        const res = computeAutoLayout(nodes, [], "TB");
        expect(Object.keys(res.positions)).toEqual(["a"]);
        const p = res.positions.a;
        expect(typeof p.x).toBe("number");
        expect(typeof p.y).toBe("number");
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
    });

    it.each<AutoLayoutDirection>(["LR", "TB"])(
        "lays out a chain in %s direction with all nodes positioned",
        (direction) => {
            const nodes = [
                makeNode("a", 0, 0),
                makeNode("b", 0, 0),
                makeNode("c", 0, 0),
            ];
            const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
            const res = computeAutoLayout(nodes, edges, direction);
            expect(Object.keys(res.positions).sort()).toEqual([
                "a",
                "b",
                "c",
            ]);
            for (const id of ["a", "b", "c"]) {
                expect(Number.isFinite(res.positions[id].x)).toBe(true);
                expect(Number.isFinite(res.positions[id].y)).toBe(true);
            }
        },
    );

    it("orients a chain along x for LR and along y for TB", () => {
        const nodes = [makeNode("a", 0, 0), makeNode("b", 0, 0)];
        const edges = [edge("e1", "a", "b")];
        const lr = computeAutoLayout(nodes, edges, "LR").positions;
        const tb = computeAutoLayout(nodes, edges, "TB").positions;
        // LR: successor advances in x; TB: successor advances in y.
        expect(lr.b.x).toBeGreaterThan(lr.a.x);
        expect(tb.b.y).toBeGreaterThan(tb.a.y);
    });

    it("skips annotation nodes entirely", () => {
        const nodes = [
            makeNode("a", 0, 0),
            makeNode("note", 0, 0, { kind: "annotation" }),
            makeNode("b", 0, 0),
        ];
        const res = computeAutoLayout(nodes, [edge("e1", "a", "b")], "LR");
        expect(res.positions).not.toHaveProperty("note");
        expect(res.positions).toHaveProperty("a");
        expect(res.positions).toHaveProperty("b");
    });

    it("drops edges whose endpoints are not both participating", () => {
        // Edge references an annotation (skipped) node — must not throw.
        const nodes = [
            makeNode("a", 0, 0),
            makeNode("note", 0, 0, { kind: "annotation" }),
        ];
        const res = computeAutoLayout(
            nodes,
            [edge("e1", "a", "note"), edge("e2", "note", "a")],
            "LR",
        );
        expect(Object.keys(res.positions)).toEqual(["a"]);
    });

    it("uses larger box for group nodes (sizing path, no throw)", () => {
        const nodes = [
            makeNode("g", 0, 0, { kind: "group" }),
            makeNode("a", 0, 0),
        ];
        const res = computeAutoLayout(nodes, [edge("e1", "g", "a")], "TB");
        expect(res.positions).toHaveProperty("g");
        expect(res.positions).toHaveProperty("a");
    });

    it("honours explicit measured width/height on a node", () => {
        const nodes = [
            makeNode("a", 0, 0, { width: 300, height: 120 }),
            makeNode("b", 0, 0),
        ];
        const res = computeAutoLayout(nodes, [edge("e1", "a", "b")], "LR");
        expect(res.positions).toHaveProperty("a");
        expect(res.positions).toHaveProperty("b");
    });

    it("falls back to style.width/height when node dims absent", () => {
        const nodes = [
            makeNode("a", 0, 0, { styleWidth: 250, styleHeight: 90 }),
            makeNode("b", 0, 0),
        ];
        const res = computeAutoLayout(nodes, [edge("e1", "a", "b")], "LR");
        expect(res.positions).toHaveProperty("a");
        expect(res.positions).toHaveProperty("b");
    });

    describe("nodeIdsFilter (subset layout with centroid preservation)", () => {
        it("only returns positions for filtered node ids", () => {
            const nodes = [
                makeNode("a", 100, 100),
                makeNode("b", 200, 100),
                makeNode("c", 5000, 5000), // excluded
            ];
            const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
            const res = computeAutoLayout(
                nodes,
                edges,
                "LR",
                new Set(["a", "b"]),
            );
            expect(Object.keys(res.positions).sort()).toEqual(["a", "b"]);
            expect(res.positions).not.toHaveProperty("c");
        });

        it("preserves the subset centroid near its original location", () => {
            // Two nodes clustered around (1000, 1000); after subset
            // layout their centroid should land back near (1000,1000)
            // rather than near the origin.
            const nodes = [
                makeNode("a", 1000, 1000),
                makeNode("b", 1100, 1000),
                makeNode("c", 0, 0), // excluded but present
            ];
            const filter = new Set(["a", "b"]);
            const res = computeAutoLayout(
                nodes,
                [edge("e1", "a", "b")],
                "LR",
                filter,
            );
            const beforeCx = (1000 + 1100) / 2;
            const beforeCy = 1000; // both nodes share y=1000, so the centroid y is 1000
            const afterCx = (res.positions.a.x + res.positions.b.x) / 2;
            const afterCy = (res.positions.a.y + res.positions.b.y) / 2;
            // Centroid preserved within a node's worth of slack.
            expect(Math.abs(afterCx - beforeCx)).toBeLessThan(1);
            expect(Math.abs(afterCy - beforeCy)).toBeLessThan(1);
        });

        it("returns empty positions when the filter matches no nodes", () => {
            const nodes = [makeNode("a", 0, 0), makeNode("b", 0, 0)];
            const res = computeAutoLayout(
                nodes,
                [],
                "LR",
                new Set(["nonexistent"]),
            );
            expect(res.positions).toEqual({});
        });
    });
});

describe("computeForceLayout (elkjs)", () => {
    it("returns an empty positions map for no nodes", async () => {
        const res = await computeForceLayout([], []);
        expect(res.positions).toEqual({});
    });

    it("positions every non-annotation node", async () => {
        const nodes = [
            makeNode("a", 0, 0),
            makeNode("b", 0, 0),
            makeNode("c", 0, 0),
        ];
        const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
        const res = await computeForceLayout(nodes, edges);
        expect(Object.keys(res.positions).sort()).toEqual(["a", "b", "c"]);
        for (const id of ["a", "b", "c"]) {
            expect(Number.isFinite(res.positions[id].x)).toBe(true);
            expect(Number.isFinite(res.positions[id].y)).toBe(true);
        }
    });

    it("skips annotation nodes", async () => {
        const nodes = [
            makeNode("a", 0, 0),
            makeNode("note", 0, 0, { kind: "annotation" }),
            makeNode("b", 0, 0),
        ];
        const res = await computeForceLayout(nodes, [edge("e1", "a", "b")]);
        expect(res.positions).not.toHaveProperty("note");
        expect(res.positions).toHaveProperty("a");
        expect(res.positions).toHaveProperty("b");
    });

    it("uses group + measured + style sizing paths without throwing", async () => {
        const nodes = [
            makeNode("g", 0, 0, { kind: "group" }),
            makeNode("m", 0, 0, { width: 300, height: 120 }),
            makeNode("s", 0, 0, { styleWidth: 250, styleHeight: 90 }),
            makeNode("d", 0, 0),
        ];
        const edges = [
            edge("e1", "g", "m"),
            edge("e2", "m", "s"),
            edge("e3", "s", "d"),
        ];
        const res = await computeForceLayout(nodes, edges);
        expect(Object.keys(res.positions).sort()).toEqual([
            "d",
            "g",
            "m",
            "s",
        ]);
    });

    it("drops edges whose endpoints are not both participating", async () => {
        const nodes = [
            makeNode("a", 0, 0),
            makeNode("note", 0, 0, { kind: "annotation" }),
        ];
        const res = await computeForceLayout(nodes, [
            edge("e1", "a", "note"),
        ]);
        expect(Object.keys(res.positions)).toEqual(["a"]);
    });

    it("scopes to nodeIdsFilter and preserves the subset centroid", async () => {
        const nodes = [
            makeNode("a", 1000, 1000),
            makeNode("b", 1100, 1000),
            makeNode("c", 0, 0), // excluded
        ];
        const filter = new Set(["a", "b"]);
        const res = await computeForceLayout(
            nodes,
            [edge("e1", "a", "b")],
            filter,
        );
        expect(Object.keys(res.positions).sort()).toEqual(["a", "b"]);
        const beforeCx = (1000 + 1100) / 2;
        const afterCx = (res.positions.a.x + res.positions.b.x) / 2;
        expect(Math.abs(afterCx - beforeCx)).toBeLessThan(1);
    });
});
