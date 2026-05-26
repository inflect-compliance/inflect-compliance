/**
 * Epic P5-PR-B — Canvas diff: compute the visual delta between
 * two graph snapshots.
 *
 * Inputs: two snapshots, each carrying `{ nodes, edges }` in the
 * same shape `replaceGraph` accepts. Output: a per-node + per-
 * edge classification (`added`, `removed`, `moved`, `modified`,
 * `unchanged`) the renderer reads to colour-code the overlay.
 *
 * Identity:
 *   - Nodes match by `nodeKey` (client-stable id; persists across
 *     versions). `nodeKey` is unique per map.
 *   - Edges match by `edgeKey` (same model).
 *
 * Classifications:
 *   - `added`: present in B, absent in A.
 *   - `removed`: present in A, absent in B.
 *   - `moved`: present in both, position OR label changed but the
 *     identity didn't.
 *   - `modified`: present in both, dataJson changed (and not just
 *     position/label).
 *   - `unchanged`: identical across A → B.
 *
 * Why a pure function:
 *   - The renderer is a one-pass overlay; computing the diff
 *     ad-hoc keeps the overlay stateless. Easy to unit-test.
 */

export type DiffClass =
    | "added"
    | "removed"
    | "moved"
    | "modified"
    | "unchanged";

interface DiffNodeRow {
    nodeKey: string;
    nodeType: string;
    label: string;
    subtitle: string | null;
    posX: number;
    posY: number;
    parentNodeKey: string | null;
    dataJson: unknown;
}

interface DiffEdgeRow {
    edgeKey: string;
    sourceKey: string;
    targetKey: string;
    edgeKind: string;
    labelOverride: string | null;
    dataJson: unknown;
}

export interface DiffGraphSnapshot {
    nodes: DiffNodeRow[];
    edges: DiffEdgeRow[];
}

export interface CanvasDiff {
    nodes: Map<string, DiffClass>;
    edges: Map<string, DiffClass>;
    summary: {
        nodesAdded: number;
        nodesRemoved: number;
        nodesMoved: number;
        nodesModified: number;
        edgesAdded: number;
        edgesRemoved: number;
        edgesModified: number;
    };
}

const EPSILON = 0.5;
const posDiffers = (a: number, b: number) => Math.abs(a - b) > EPSILON;

function classifyNode(a: DiffNodeRow, b: DiffNodeRow): DiffClass {
    const positionChanged =
        posDiffers(a.posX, b.posX) || posDiffers(a.posY, b.posY);
    const labelChanged =
        a.label !== b.label || (a.subtitle ?? null) !== (b.subtitle ?? null);
    const dataChanged =
        JSON.stringify(a.dataJson ?? null) !==
        JSON.stringify(b.dataJson ?? null);
    const typeChanged = a.nodeType !== b.nodeType;
    const parentChanged = (a.parentNodeKey ?? null) !== (b.parentNodeKey ?? null);

    if (!positionChanged && !labelChanged && !dataChanged && !typeChanged && !parentChanged) {
        return "unchanged";
    }
    if (positionChanged && !labelChanged && !dataChanged && !typeChanged && !parentChanged) {
        return "moved";
    }
    return "modified";
}

function classifyEdge(a: DiffEdgeRow, b: DiffEdgeRow): DiffClass {
    if (
        a.sourceKey === b.sourceKey &&
        a.targetKey === b.targetKey &&
        a.edgeKind === b.edgeKind &&
        (a.labelOverride ?? null) === (b.labelOverride ?? null) &&
        JSON.stringify(a.dataJson ?? null) ===
            JSON.stringify(b.dataJson ?? null)
    ) {
        return "unchanged";
    }
    return "modified";
}

export function computeCanvasDiff(
    base: DiffGraphSnapshot,
    next: DiffGraphSnapshot,
): CanvasDiff {
    const nodeClasses = new Map<string, DiffClass>();
    const edgeClasses = new Map<string, DiffClass>();
    const summary = {
        nodesAdded: 0,
        nodesRemoved: 0,
        nodesMoved: 0,
        nodesModified: 0,
        edgesAdded: 0,
        edgesRemoved: 0,
        edgesModified: 0,
    };

    const baseNodes = new Map(base.nodes.map((n) => [n.nodeKey, n]));
    const nextNodes = new Map(next.nodes.map((n) => [n.nodeKey, n]));
    for (const [key, baseNode] of baseNodes) {
        const nextNode = nextNodes.get(key);
        if (!nextNode) {
            nodeClasses.set(key, "removed");
            summary.nodesRemoved += 1;
            continue;
        }
        const c = classifyNode(baseNode, nextNode);
        nodeClasses.set(key, c);
        if (c === "moved") summary.nodesMoved += 1;
        if (c === "modified") summary.nodesModified += 1;
    }
    for (const [key] of nextNodes) {
        if (!baseNodes.has(key)) {
            nodeClasses.set(key, "added");
            summary.nodesAdded += 1;
        }
    }

    const baseEdges = new Map(base.edges.map((e) => [e.edgeKey, e]));
    const nextEdges = new Map(next.edges.map((e) => [e.edgeKey, e]));
    for (const [key, baseEdge] of baseEdges) {
        const nextEdge = nextEdges.get(key);
        if (!nextEdge) {
            edgeClasses.set(key, "removed");
            summary.edgesRemoved += 1;
            continue;
        }
        const c = classifyEdge(baseEdge, nextEdge);
        edgeClasses.set(key, c);
        if (c === "modified") summary.edgesModified += 1;
    }
    for (const [key] of nextEdges) {
        if (!baseEdges.has(key)) {
            edgeClasses.set(key, "added");
            summary.edgesAdded += 1;
        }
    }

    return { nodes: nodeClasses, edges: edgeClasses, summary };
}
