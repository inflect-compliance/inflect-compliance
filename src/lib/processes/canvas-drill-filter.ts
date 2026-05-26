"use client";

/**
 * Epic P6-PR-A — Drill-scoped graph filter.
 *
 * Given the live nodes + edges and the current drill scope (a
 * group id or null for root), returns the subset of nodes + edges
 * that should render. Pure function — easy to unit-test, no React
 * state.
 *
 * Filtering rules:
 *   - At root (`groupId === null`):
 *     - Visible nodes: those with `parentId == null` (top-level)
 *       AND their immediate children (so a group RENDERS with
 *       its contents at root).
 *   - Inside a group (`groupId !== null`):
 *     - Visible nodes: those whose `parentId === groupId`. The
 *       group itself is hidden — the user is INSIDE it; no
 *       reason to render the container they entered.
 *   - Visible edges: both endpoints visible.
 *
 * Why exclude the parent group itself when drilled in:
 *   - The breadcrumb already announces "we are inside <group>".
 *   - Rendering the parent's box around its own contents is
 *     visual noise — the user wants to focus on the steps, not
 *     the chrome.
 */

import type { Edge, Node } from "@xyflow/react";

export interface DrillFilterResult {
    visibleNodes: Node[];
    visibleEdges: Edge[];
}

export function filterByDrillScope(
    nodes: Node[],
    edges: Edge[],
    groupId: string | null,
): DrillFilterResult {
    if (groupId === null) {
        // Root: every node is visible. The user expects the full
        // graph at this level.
        return { visibleNodes: nodes, visibleEdges: edges };
    }
    const visibleIds = new Set<string>();
    for (const n of nodes) {
        const parentId = (n as { parentId?: string }).parentId;
        if (parentId === groupId) {
            visibleIds.add(n.id);
        }
    }
    const visibleNodes = nodes.filter((n) => visibleIds.has(n.id));
    const visibleEdges = edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    return { visibleNodes, visibleEdges };
}

/**
 * Build the breadcrumb trail labels given the drill stack +
 * the live nodes (so we can look up display names).
 *
 * Returns an array of `{ id, label }` rows ordered root →
 * deepest. The root row is `{ id: null, label: "All processes" }`.
 */
export function buildDrillBreadcrumbs(
    stack: string[],
    nodes: Node[],
    rootLabel = "All",
): Array<{ id: string | null; label: string }> {
    const trail: Array<{ id: string | null; label: string }> = [
        { id: null, label: rootLabel },
    ];
    for (const groupId of stack) {
        const node = nodes.find((n) => n.id === groupId);
        const label =
            (node?.data as { label?: unknown } | undefined)?.label;
        trail.push({
            id: groupId,
            label: typeof label === "string" && label.length > 0
                ? label
                : "Group",
        });
    }
    return trail;
}
