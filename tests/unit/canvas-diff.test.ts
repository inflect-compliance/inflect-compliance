/**
 * Unit tests for the canvas diff pure-logic module.
 *
 * `computeCanvasDiff` classifies every node + edge across two graph
 * snapshots into added / removed / moved / modified / unchanged and
 * rolls the counts into a summary. These tests exercise each
 * classification branch (and the EPSILON position threshold).
 */
import {
    computeCanvasDiff,
    type DiffGraphSnapshot,
} from "@/lib/processes/canvas-diff";

type DiffNodeRow = DiffGraphSnapshot["nodes"][number];
type DiffEdgeRow = DiffGraphSnapshot["edges"][number];

function node(overrides: Partial<DiffNodeRow> = {}): DiffNodeRow {
    return {
        nodeKey: "n1",
        nodeType: "step",
        label: "Step",
        subtitle: null,
        posX: 0,
        posY: 0,
        parentNodeKey: null,
        dataJson: null,
        ...overrides,
    };
}

function edge(overrides: Partial<DiffEdgeRow> = {}): DiffEdgeRow {
    return {
        edgeKey: "e1",
        sourceKey: "n1",
        targetKey: "n2",
        edgeKind: "flow",
        labelOverride: null,
        dataJson: null,
        ...overrides,
    };
}

function snap(
    nodes: DiffNodeRow[] = [],
    edges: DiffEdgeRow[] = [],
): DiffGraphSnapshot {
    return { nodes, edges };
}

describe("computeCanvasDiff", () => {
    it("returns empty maps + zeroed summary for two empty snapshots", () => {
        const diff = computeCanvasDiff(snap(), snap());
        expect(diff.nodes.size).toBe(0);
        expect(diff.edges.size).toBe(0);
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

    describe("node classification", () => {
        it("classifies an unchanged node", () => {
            const n = node({ nodeKey: "a" });
            const diff = computeCanvasDiff(snap([n]), snap([{ ...n }]));
            expect(diff.nodes.get("a")).toBe("unchanged");
            expect(diff.summary.nodesMoved).toBe(0);
            expect(diff.summary.nodesModified).toBe(0);
        });

        it("classifies a removed node (present in base, absent in next)", () => {
            const diff = computeCanvasDiff(
                snap([node({ nodeKey: "gone" })]),
                snap([]),
            );
            expect(diff.nodes.get("gone")).toBe("removed");
            expect(diff.summary.nodesRemoved).toBe(1);
        });

        it("classifies an added node (absent in base, present in next)", () => {
            const diff = computeCanvasDiff(
                snap([]),
                snap([node({ nodeKey: "new" })]),
            );
            expect(diff.nodes.get("new")).toBe("added");
            expect(diff.summary.nodesAdded).toBe(1);
        });

        it("classifies a moved node when only X position changes beyond EPSILON", () => {
            const a = node({ nodeKey: "m", posX: 0 });
            const b = node({ nodeKey: "m", posX: 10 });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("m")).toBe("moved");
            expect(diff.summary.nodesMoved).toBe(1);
        });

        it("classifies a moved node when only Y position changes beyond EPSILON", () => {
            const a = node({ nodeKey: "m", posY: 0 });
            const b = node({ nodeKey: "m", posY: 5 });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("m")).toBe("moved");
        });

        it("treats a sub-EPSILON position nudge as unchanged", () => {
            // EPSILON is 0.5 — a 0.4px nudge must NOT register.
            const a = node({ nodeKey: "m", posX: 0, posY: 0 });
            const b = node({ nodeKey: "m", posX: 0.4, posY: 0.4 });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("m")).toBe("unchanged");
        });

        it("classifies modified when the label changes", () => {
            const a = node({ nodeKey: "x", label: "Old" });
            const b = node({ nodeKey: "x", label: "New" });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
            expect(diff.summary.nodesModified).toBe(1);
        });

        it("classifies modified when the subtitle changes (null vs string)", () => {
            const a = node({ nodeKey: "x", subtitle: null });
            const b = node({ nodeKey: "x", subtitle: "hint" });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("classifies modified when the subtitle goes from string to null", () => {
            const a = node({ nodeKey: "x", subtitle: "hint" });
            const b = node({ nodeKey: "x", subtitle: null });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("classifies modified when parentNodeKey goes from set to null", () => {
            const a = node({ nodeKey: "x", parentNodeKey: "grp" });
            const b = node({ nodeKey: "x", parentNodeKey: null });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("classifies modified when dataJson changes", () => {
            const a = node({ nodeKey: "x", dataJson: { k: 1 } });
            const b = node({ nodeKey: "x", dataJson: { k: 2 } });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("treats equivalent dataJson as unchanged (JSON.stringify equality)", () => {
            const a = node({ nodeKey: "x", dataJson: { k: 1 } });
            const b = node({ nodeKey: "x", dataJson: { k: 1 } });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("unchanged");
        });

        it("treats undefined vs null dataJson as unchanged (?? null coercion)", () => {
            const a = node({ nodeKey: "x", dataJson: undefined });
            const b = node({ nodeKey: "x", dataJson: null });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("unchanged");
        });

        it("classifies modified when nodeType changes", () => {
            const a = node({ nodeKey: "x", nodeType: "step" });
            const b = node({ nodeKey: "x", nodeType: "decision" });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("classifies modified when parentNodeKey changes", () => {
            const a = node({ nodeKey: "x", parentNodeKey: null });
            const b = node({ nodeKey: "x", parentNodeKey: "grp" });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
        });

        it("classifies modified (not moved) when position AND label both change", () => {
            const a = node({ nodeKey: "x", posX: 0, label: "Old" });
            const b = node({ nodeKey: "x", posX: 50, label: "New" });
            const diff = computeCanvasDiff(snap([a]), snap([b]));
            expect(diff.nodes.get("x")).toBe("modified");
            expect(diff.summary.nodesMoved).toBe(0);
            expect(diff.summary.nodesModified).toBe(1);
        });

        it("handles a mixed graph (added + removed + moved + modified + unchanged)", () => {
            const base = snap([
                node({ nodeKey: "keep" }),
                node({ nodeKey: "drop" }),
                node({ nodeKey: "move", posX: 0 }),
                node({ nodeKey: "edit", label: "A" }),
            ]);
            const next = snap([
                node({ nodeKey: "keep" }),
                node({ nodeKey: "move", posX: 100 }),
                node({ nodeKey: "edit", label: "B" }),
                node({ nodeKey: "fresh" }),
            ]);
            const diff = computeCanvasDiff(base, next);
            expect(diff.nodes.get("keep")).toBe("unchanged");
            expect(diff.nodes.get("drop")).toBe("removed");
            expect(diff.nodes.get("move")).toBe("moved");
            expect(diff.nodes.get("edit")).toBe("modified");
            expect(diff.nodes.get("fresh")).toBe("added");
            expect(diff.summary).toMatchObject({
                nodesAdded: 1,
                nodesRemoved: 1,
                nodesMoved: 1,
                nodesModified: 1,
            });
        });
    });

    describe("edge classification", () => {
        it("classifies an unchanged edge", () => {
            const e = edge({ edgeKey: "a" });
            const diff = computeCanvasDiff(
                snap([], [e]),
                snap([], [{ ...e }]),
            );
            expect(diff.edges.get("a")).toBe("unchanged");
            expect(diff.summary.edgesModified).toBe(0);
        });

        it("classifies a removed edge", () => {
            const diff = computeCanvasDiff(
                snap([], [edge({ edgeKey: "gone" })]),
                snap([], []),
            );
            expect(diff.edges.get("gone")).toBe("removed");
            expect(diff.summary.edgesRemoved).toBe(1);
        });

        it("classifies an added edge", () => {
            const diff = computeCanvasDiff(
                snap([], []),
                snap([], [edge({ edgeKey: "new" })]),
            );
            expect(diff.edges.get("new")).toBe("added");
            expect(diff.summary.edgesAdded).toBe(1);
        });

        it("classifies modified when sourceKey changes", () => {
            const a = edge({ edgeKey: "e", sourceKey: "n1" });
            const b = edge({ edgeKey: "e", sourceKey: "n9" });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
            expect(diff.summary.edgesModified).toBe(1);
        });

        it("classifies modified when targetKey changes", () => {
            const a = edge({ edgeKey: "e", targetKey: "n2" });
            const b = edge({ edgeKey: "e", targetKey: "n8" });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
        });

        it("classifies modified when edgeKind changes", () => {
            const a = edge({ edgeKey: "e", edgeKind: "flow" });
            const b = edge({ edgeKey: "e", edgeKind: "control" });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
        });

        it("classifies modified when labelOverride changes", () => {
            const a = edge({ edgeKey: "e", labelOverride: null });
            const b = edge({ edgeKey: "e", labelOverride: "yes" });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
        });

        it("classifies modified when labelOverride goes from string to null", () => {
            const a = edge({ edgeKey: "e", labelOverride: "yes" });
            const b = edge({ edgeKey: "e", labelOverride: null });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
        });

        it("classifies modified when dataJson changes", () => {
            const a = edge({ edgeKey: "e", dataJson: { w: 1 } });
            const b = edge({ edgeKey: "e", dataJson: { w: 2 } });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("modified");
        });

        it("treats undefined vs null edge dataJson as unchanged", () => {
            const a = edge({ edgeKey: "e", dataJson: undefined });
            const b = edge({ edgeKey: "e", dataJson: null });
            const diff = computeCanvasDiff(snap([], [a]), snap([], [b]));
            expect(diff.edges.get("e")).toBe("unchanged");
        });

        it("handles a mixed edge graph", () => {
            const base = snap(
                [],
                [
                    edge({ edgeKey: "keep" }),
                    edge({ edgeKey: "drop" }),
                    edge({ edgeKey: "edit", edgeKind: "flow" }),
                ],
            );
            const next = snap(
                [],
                [
                    edge({ edgeKey: "keep" }),
                    edge({ edgeKey: "edit", edgeKind: "control" }),
                    edge({ edgeKey: "fresh" }),
                ],
            );
            const diff = computeCanvasDiff(base, next);
            expect(diff.edges.get("keep")).toBe("unchanged");
            expect(diff.edges.get("drop")).toBe("removed");
            expect(diff.edges.get("edit")).toBe("modified");
            expect(diff.edges.get("fresh")).toBe("added");
            expect(diff.summary).toMatchObject({
                edgesAdded: 1,
                edgesRemoved: 1,
                edgesModified: 1,
            });
        });
    });
});
