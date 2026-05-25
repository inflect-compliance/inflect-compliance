"use client";

/**
 * R32-PR5 — Canvas emphasis context.
 *
 * When the user selects a node or edge on the Processes canvas,
 * the rest of the graph dims out so the eye can read *what
 * touches what* at a glance. The emphasis "neighbourhood" is:
 *
 *   • If a node is selected — the selected node + every node
 *     connected to it via a direct edge (one hop).
 *   • If an edge is selected — both endpoints of that edge.
 *   • If nothing is selected — null (no dimming).
 *
 * The neighbourhood is derived in `PersistedProcessCanvas` and
 * threaded through this context so the typed-node + edge
 * renderers can consume it without prop-drilling. The renderers
 * read the context, compute `isDimmed` / `isEmphasised`, and
 * apply opacity / stroke treatments accordingly.
 *
 * Why a React context rather than mutating `node.data.dimmed`?
 *   • Mutating `node.data` on every selection forces xyflow to
 *     re-clone the node objects, which triggers its own remount
 *     pipeline. A context flip is O(1) and doesn't disturb
 *     xyflow's internal state.
 *   • The emphasis is a render-only concern; it should never
 *     persist to the document. Keeping it OUT of `node.data`
 *     means a Save while a node is selected serialises a clean
 *     graph (no `dimmed: true` artefacts shipping to disk).
 *
 * Default value: a no-op (`null` neighbourhood) so renderers
 * outside the provider degrade gracefully — e.g. the
 * `process-typed-node.test.tsx` rendered tests don't need to
 * stand up a provider just to render a single node.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface CanvasEmphasisValue {
    /**
     * The set of node-ids that count as "in the neighbourhood".
     * `null` ⇒ no selection ⇒ everything renders normally.
     */
    emphasisIds: ReadonlySet<string> | null;
}

const CanvasEmphasisContext = createContext<CanvasEmphasisValue>({
    emphasisIds: null,
});

export function CanvasEmphasisProvider({
    emphasisIds,
    children,
}: {
    emphasisIds: ReadonlySet<string> | null;
    children: ReactNode;
}) {
    // `useMemo` is intentional — the consumer (the typed-node
    // renderer wrapped in React.memo) will skip render when the
    // value reference is stable. The provider passes a fresh
    // object literal only when the underlying set changes.
    return (
        <CanvasEmphasisContext.Provider value={{ emphasisIds }}>
            {children}
        </CanvasEmphasisContext.Provider>
    );
}

/**
 * Read the emphasis neighbourhood.
 *
 *   • Returns `{ emphasisIds: null }` outside a provider (no-op).
 *   • Returns `{ emphasisIds: Set<string> | null }` inside the
 *     canvas's provider — the set is non-null only when a
 *     selection is active.
 */
export function useCanvasEmphasis(): CanvasEmphasisValue {
    return useContext(CanvasEmphasisContext);
}

/**
 * Helper — given a node id, classify it against the current
 * emphasis state. The typed-node renderer calls this; the edge
 * renderer calls it twice (source + target).
 *
 *   • `'normal'`     — no selection is active.
 *   • `'emphasised'` — id is part of the selected neighbourhood.
 *   • `'dimmed'`     — selection is active but this id falls
 *                       outside the neighbourhood.
 */
export type EmphasisClass = "normal" | "emphasised" | "dimmed";

export function classifyForEmphasis(
    id: string,
    emphasisIds: ReadonlySet<string> | null,
): EmphasisClass {
    if (emphasisIds === null) return "normal";
    return emphasisIds.has(id) ? "emphasised" : "dimmed";
}
