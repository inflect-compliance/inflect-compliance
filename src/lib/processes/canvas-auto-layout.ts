"use client";

/**
 * Epic P4-PR-A — Canvas auto-layout via dagre.
 *
 * Closes the brief's #1 🟠 "Auto-Layout Engine" gap. Pre-P4
 * authors had to manually position every node; a 20-node map
 * (typical for a compliance process) is hours of drag-and-align.
 * Auto-layout hits the same shape Visio + Figma + Lucidchart all
 * ship: pick a direction, click "Arrange", every node snaps to a
 * hierarchical layout in one move.
 *
 * Why dagre:
 *   - It's xyflow's official auto-layout recommendation (their
 *     own examples use it).
 *   - Pure JS, no native deps, ~50KB gzip.
 *   - Hierarchical layouts (LR + TB) cover ≥90% of compliance
 *     process maps. Force-directed (organic) lives in elkjs — a
 *     follow-up if user demand emerges.
 *
 * Why a helper not a hook:
 *   - The function is stateless — takes nodes + edges + opts,
 *     returns the new positions. The canvas owns "push history,
 *     setNodes, markDirty"; this module just answers "where do
 *     the nodes go?".
 *   - Easier to unit-test (no React render).
 */

import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export type AutoLayoutDirection = "LR" | "TB";

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 80;
// Group nodes are larger by design; the canvas defaults them to
// 280×160. We pass those measurements to dagre so the algorithm
// allocates appropriate spacing.
const GROUP_NODE_WIDTH = 280;
const GROUP_NODE_HEIGHT = 160;
const RANKSEP = 80;
const NODESEP = 48;

export interface AutoLayoutResult {
    /** New positions keyed by xyflow node id. */
    positions: Record<string, { x: number; y: number }>;
}

/**
 * Compute auto-layout positions for the supplied graph. The
 * caller applies the positions via `setNodes(prev => prev.map(...))`
 * and pushes the prior state to history.
 *
 * Nodes whose `data.kind === 'annotation'` are skipped — they're
 * floating tags that don't participate in the flow direction.
 */
export function computeAutoLayout(
    nodes: Node[],
    edges: Edge[],
    direction: AutoLayoutDirection,
): AutoLayoutResult {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: direction,
        ranksep: RANKSEP,
        nodesep: NODESEP,
        marginx: 32,
        marginy: 32,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Track which nodes participate so we don't add positions for
    // skipped (annotation) nodes.
    const participatingIds = new Set<string>();
    for (const node of nodes) {
        const kind = (node.data as { kind?: unknown } | undefined)?.kind;
        if (kind === "annotation") continue;
        // Use the node's measured dimensions if xyflow has them,
        // else the design defaults. Group nodes get the larger box.
        const measuredW =
            (node as { width?: number | null }).width ??
            ((node.style as { width?: unknown } | undefined)?.width as number);
        const measuredH =
            (node as { height?: number | null }).height ??
            ((node.style as { height?: unknown } | undefined)?.height as number);
        const isGroup = kind === "group";
        const w =
            typeof measuredW === "number" && Number.isFinite(measuredW)
                ? measuredW
                : isGroup
                  ? GROUP_NODE_WIDTH
                  : DEFAULT_NODE_WIDTH;
        const h =
            typeof measuredH === "number" && Number.isFinite(measuredH)
                ? measuredH
                : isGroup
                  ? GROUP_NODE_HEIGHT
                  : DEFAULT_NODE_HEIGHT;
        g.setNode(node.id, { width: w, height: h });
        participatingIds.add(node.id);
    }

    for (const edge of edges) {
        if (
            participatingIds.has(edge.source) &&
            participatingIds.has(edge.target)
        ) {
            g.setEdge(edge.source, edge.target);
        }
    }

    dagre.layout(g);

    const positions: Record<string, { x: number; y: number }> = {};
    for (const id of participatingIds) {
        const pos = g.node(id);
        if (!pos) continue;
        // dagre returns CENTRE coords; xyflow wants TOP-LEFT.
        const w = (pos.width as number) ?? DEFAULT_NODE_WIDTH;
        const h = (pos.height as number) ?? DEFAULT_NODE_HEIGHT;
        positions[id] = {
            x: pos.x - w / 2,
            y: pos.y - h / 2,
        };
    }
    return { positions };
}
