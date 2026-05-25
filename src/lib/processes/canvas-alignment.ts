/**
 * R29 — Canvas alignment helpers.
 *
 * Pure functions that compute new node positions for the multi-
 * select alignment + distribute actions. Operate on a snapshot of
 * xyflow `Node[]`, return a NEW array with the targeted nodes'
 * `position.x` / `position.y` updated. Untouched nodes are
 * returned by reference (cheap structural sharing for memo
 * downstream).
 *
 * Anchored to the selection's GROUP BOUNDS, not the canvas origin —
 * "align left" means align to the leftmost x among the selected
 * nodes, not to x=0. This is the standard design-tool semantic
 * (Figma / Sketch / Adobe XD all behave this way).
 *
 * Distribute requires ≥3 selected nodes; alignment requires ≥2.
 * Calls with fewer selected nodes are no-ops (the caller is
 * responsible for gating the UI affordance; the helpers stay
 * defensive).
 */

import type { Node } from "@xyflow/react";

export type AlignmentAxis =
    | "left"
    | "center-x"
    | "right"
    | "top"
    | "center-y"
    | "bottom";

export type DistributeAxis = "horizontal" | "vertical";

interface NodeBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * xyflow tracks measured width/height on `node.measured` once the
 * node renders. Until measure-pass completes, the field is
 * undefined; we fall back to a conservative default that keeps
 * the alignment correct relative to the *node origin*, even if
 * the visible centre is slightly off until the next render
 * triggers a re-align.
 *
 * Process steps default to ~180×72 (the renderer's md size).
 */
const FALLBACK_W = 180;
const FALLBACK_H = 72;

function boxOf(n: Node): NodeBox {
    const measured = n.measured as
        | { width?: number; height?: number }
        | undefined;
    return {
        x: n.position.x,
        y: n.position.y,
        w: measured?.width ?? n.width ?? FALLBACK_W,
        h: measured?.height ?? n.height ?? FALLBACK_H,
    };
}

/**
 * Align the selected subset of `nodes` along `axis`. Returns a
 * new array; untouched entries share references with the input
 * (memo-friendly).
 */
export function alignNodes(
    nodes: Node[],
    selectedIds: ReadonlySet<string>,
    axis: AlignmentAxis,
): Node[] {
    const selected = nodes.filter((n) => selectedIds.has(n.id));
    if (selected.length < 2) return nodes;

    const boxes = selected.map(boxOf);

    let xs: number[] = [];
    let ys: number[] = [];

    // Compute the anchor coordinate for this axis. Each branch
    // reduces the selection to one number — the target x/y the
    // selected nodes' position will be rewritten to.
    switch (axis) {
        case "left": {
            const anchor = Math.min(...boxes.map((b) => b.x));
            xs = selected.map(() => anchor);
            break;
        }
        case "right": {
            const anchor = Math.max(...boxes.map((b) => b.x + b.w));
            xs = boxes.map((b) => anchor - b.w);
            break;
        }
        case "center-x": {
            // Anchor the centre on the centroid of the selection's
            // centres — feels less violent than "snap to the
            // bounding-box centre", which can shove every node a
            // long way if one outlier is far from the cluster.
            const cx =
                boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / boxes.length;
            xs = boxes.map((b) => cx - b.w / 2);
            break;
        }
        case "top": {
            const anchor = Math.min(...boxes.map((b) => b.y));
            ys = selected.map(() => anchor);
            break;
        }
        case "bottom": {
            const anchor = Math.max(...boxes.map((b) => b.y + b.h));
            ys = boxes.map((b) => anchor - b.h);
            break;
        }
        case "center-y": {
            const cy =
                boxes.reduce((s, b) => s + b.y + b.h / 2, 0) / boxes.length;
            ys = boxes.map((b) => cy - b.h / 2);
            break;
        }
    }

    const patch = new Map<string, { x: number; y: number }>();
    selected.forEach((n, i) => {
        patch.set(n.id, {
            x: xs[i] ?? boxes[i].x,
            y: ys[i] ?? boxes[i].y,
        });
    });

    return nodes.map((n) => {
        const next = patch.get(n.id);
        if (!next) return n;
        return { ...n, position: { x: next.x, y: next.y } };
    });
}

/**
 * Evenly space the selected nodes along `axis`. The first and last
 * nodes (by current coordinate along the axis) stay put; the
 * middle nodes redistribute so the gaps between consecutive
 * centres are equal.
 *
 * Distribute needs ≥3 selected — with 2 there's nothing to
 * redistribute (the two are already "the ends").
 */
export function distributeNodes(
    nodes: Node[],
    selectedIds: ReadonlySet<string>,
    axis: DistributeAxis,
): Node[] {
    const selected = nodes.filter((n) => selectedIds.has(n.id));
    if (selected.length < 3) return nodes;

    const boxes = selected.map(boxOf);
    // Sort by the leading coordinate along the axis so the
    // "first" and "last" are stable regardless of click order.
    const order = selected
        .map((n, i) => ({ id: n.id, box: boxes[i] }))
        .sort((a, b) =>
            axis === "horizontal" ? a.box.x - b.box.x : a.box.y - b.box.y,
        );

    const first = order[0];
    const last = order[order.length - 1];

    const patch = new Map<string, { x: number; y: number }>();

    if (axis === "horizontal") {
        const firstCx = first.box.x + first.box.w / 2;
        const lastCx = last.box.x + last.box.w / 2;
        const span = lastCx - firstCx;
        const step = span / (order.length - 1);
        order.forEach((entry, i) => {
            // Endpoints stay put.
            if (i === 0 || i === order.length - 1) return;
            const targetCx = firstCx + step * i;
            patch.set(entry.id, {
                x: targetCx - entry.box.w / 2,
                y: entry.box.y,
            });
        });
    } else {
        const firstCy = first.box.y + first.box.h / 2;
        const lastCy = last.box.y + last.box.h / 2;
        const span = lastCy - firstCy;
        const step = span / (order.length - 1);
        order.forEach((entry, i) => {
            if (i === 0 || i === order.length - 1) return;
            const targetCy = firstCy + step * i;
            patch.set(entry.id, {
                x: entry.box.x,
                y: targetCy - entry.box.h / 2,
            });
        });
    }

    return nodes.map((n) => {
        const next = patch.get(n.id);
        if (!next) return n;
        return { ...n, position: { x: next.x, y: next.y } };
    });
}
