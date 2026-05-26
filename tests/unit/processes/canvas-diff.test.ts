/**
 * Epic P5-PR-B — Unit coverage for the pure `computeCanvasDiff`
 * helper. The five classifications + the summary counters are the
 * full surface; structural ratchet covers the wiring.
 */

import {
    computeCanvasDiff,
    type DiffGraphSnapshot,
} from "@/lib/processes/canvas-diff";

function n(
    nodeKey: string,
    overrides: Partial<DiffGraphSnapshot["nodes"][number]> = {},
): DiffGraphSnapshot["nodes"][number] {
    return {
        nodeKey,
        nodeType: "process-step",
        label: nodeKey,
        subtitle: null,
        posX: 0,
        posY: 0,
        parentNodeKey: null,
        dataJson: null,
        ...overrides,
    };
}

function e(
    edgeKey: string,
    sourceKey: string,
    targetKey: string,
    overrides: Partial<DiffGraphSnapshot["edges"][number]> = {},
): DiffGraphSnapshot["edges"][number] {
    return {
        edgeKey,
        sourceKey,
        targetKey,
        edgeKind: "flow",
        labelOverride: null,
        dataJson: null,
        ...overrides,
    };
}

describe("computeCanvasDiff", () => {
    it("classifies identical graphs as fully unchanged", () => {
        const base: DiffGraphSnapshot = {
            nodes: [n("a"), n("b")],
            edges: [e("e1", "a", "b")],
        };
        const next: DiffGraphSnapshot = {
            nodes: [n("a"), n("b")],
            edges: [e("e1", "a", "b")],
        };
        const diff = computeCanvasDiff(base, next);
        expect(diff.nodes.get("a")).toBe("unchanged");
        expect(diff.nodes.get("b")).toBe("unchanged");
        expect(diff.edges.get("e1")).toBe("unchanged");
        expect(diff.summary).toEqual({
            nodesAdded: 0,
            nodesRemoved: 0,
            nodesMoved: 0,
            nodesModified: 0,
            edgesAdded: 0,
            edgesRemoved: 0,
            edgesModified: 0,
        });
    });

    it("detects an added node + edge as `added`", () => {
        const base: DiffGraphSnapshot = {
            nodes: [n("a")],
            edges: [],
        };
        const next: DiffGraphSnapshot = {
            nodes: [n("a"), n("b")],
            edges: [e("e1", "a", "b")],
        };
        const diff = computeCanvasDiff(base, next);
        expect(diff.nodes.get("a")).toBe("unchanged");
        expect(diff.nodes.get("b")).toBe("added");
        expect(diff.edges.get("e1")).toBe("added");
        expect(diff.summary.nodesAdded).toBe(1);
        expect(diff.summary.edgesAdded).toBe(1);
    });

    it("detects a deleted node + its dangling edge as `removed`", () => {
        const base: DiffGraphSnapshot = {
            nodes: [n("a"), n("b")],
            edges: [e("e1", "a", "b")],
        };
        const next: DiffGraphSnapshot = {
            nodes: [n("a")],
            edges: [],
        };
        const diff = computeCanvasDiff(base, next);
        expect(diff.nodes.get("b")).toBe("removed");
        expect(diff.edges.get("e1")).toBe("removed");
        expect(diff.summary.nodesRemoved).toBe(1);
        expect(diff.summary.edgesRemoved).toBe(1);
    });

    it("classifies a pure position change as `moved`", () => {
        const base: DiffGraphSnapshot = {
            nodes: [n("a", { posX: 0, posY: 0 })],
            edges: [],
        };
        const next: DiffGraphSnapshot = {
            nodes: [n("a", { posX: 120, posY: 60 })],
            edges: [],
        };
        const diff = computeCanvasDiff(base, next);
        expect(diff.nodes.get("a")).toBe("moved");
        expect(diff.summary.nodesMoved).toBe(1);
    });

    it("classifies a label OR data change as `modified` (not `moved`)", () => {
        const labelDiff = computeCanvasDiff(
            { nodes: [n("a", { label: "Old" })], edges: [] },
            { nodes: [n("a", { label: "New" })], edges: [] },
        );
        expect(labelDiff.nodes.get("a")).toBe("modified");
        expect(labelDiff.summary.nodesModified).toBe(1);

        const dataDiff = computeCanvasDiff(
            { nodes: [n("a", { dataJson: { size: "lg" } })], edges: [] },
            { nodes: [n("a", { dataJson: { size: "xl" } })], edges: [] },
        );
        expect(dataDiff.nodes.get("a")).toBe("modified");
    });

    it("treats sub-EPSILON position drift as unchanged", () => {
        const diff = computeCanvasDiff(
            { nodes: [n("a", { posX: 100, posY: 200 })], edges: [] },
            { nodes: [n("a", { posX: 100.1, posY: 200.4 })], edges: [] },
        );
        // Inside EPSILON=0.5 — counts as unchanged so the user
        // doesn't see micro-pixel-drift "moves" after autosave.
        expect(diff.nodes.get("a")).toBe("unchanged");
    });

    it("classifies edge endpoint or kind change as `modified`", () => {
        const diff = computeCanvasDiff(
            {
                nodes: [n("a"), n("b"), n("c")],
                edges: [e("e1", "a", "b")],
            },
            {
                nodes: [n("a"), n("b"), n("c")],
                edges: [e("e1", "a", "c")],
            },
        );
        expect(diff.edges.get("e1")).toBe("modified");
        expect(diff.summary.edgesModified).toBe(1);
    });
});
