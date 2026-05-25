"use client";

/**
 * R29 — Canvas change event seam.
 *
 * Typed event-emit hook the canvas calls on every committed graph
 * mutation. Today the only subscriber is autosave (which still
 * lives on its own `markDirty` channel for backward compatibility);
 * the hook exists so future collaboration / awareness / activity-
 * feed listeners can subscribe to a STRUCTURED event rather than
 * inferring intent from xyflow's low-level NodeChange / EdgeChange.
 *
 * Why a typed event, not raw NodeChange / EdgeChange?
 *   • xyflow's change types are render-driven, not semantically
 *     meaningful — selection clicks, dimension reports, and drag-
 *     ticks all flow through them. A collab layer that subscribes
 *     to those will fire on every mouse-move and corrupt the wire
 *     contract before a single byte ships.
 *   • A typed event lets us add fields (actor id, ts, op id)
 *     without renegotiating with xyflow.
 *
 * Why not Redux / Zustand?
 *   • The canvas already owns its state via xyflow + React local
 *     state. A second store creates a sync problem. The emit hook
 *     is a side channel that observes commits — no second source
 *     of truth.
 *
 * Why a `useRef` subscriber registry, not React context?
 *   • Subscribers are typically the canvas's own peers (autosave
 *     hook, a future collab provider). They register once and
 *     never re-bind. A ref-backed registry is the minimum that
 *     guarantees synchronous emit on the same React tick the
 *     state update happened in.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";

export type CanvasChangeEventType =
    | "node.add"
    | "node.remove"
    | "node.move"
    | "node.update"
    | "edge.add"
    | "edge.remove"
    | "edge.update"
    | "graph.replace";

export interface CanvasChangeEvent {
    type: CanvasChangeEventType;
    /**
     * Logical ids of the affected entities. `node.add` carries the
     * new node id; `graph.replace` carries every node id in the
     * new snapshot.
     */
    nodeIds: string[];
    edgeIds: string[];
    /** Wall-clock ms when the canvas emitted the event. */
    timestamp: number;
}

export type CanvasChangeSubscriber = (event: CanvasChangeEvent) => void;

export interface CanvasChangeEmitterApi {
    emit: (
        type: CanvasChangeEventType,
        ids: { nodeIds?: string[]; edgeIds?: string[] },
    ) => void;
    /** Snapshot helper — extracts ids from a `{ nodes, edges }` shape. */
    emitGraphReplace: (snapshot: {
        nodes: Node[];
        edges: Edge[];
    }) => void;
    subscribe: (s: CanvasChangeSubscriber) => () => void;
}

export function useCanvasChangeEmitter(): CanvasChangeEmitterApi {
    const subsRef = useRef<Set<CanvasChangeSubscriber>>(new Set());

    const subscribe = useCallback((s: CanvasChangeSubscriber) => {
        subsRef.current.add(s);
        return () => {
            subsRef.current.delete(s);
        };
    }, []);

    const emit = useCallback(
        (
            type: CanvasChangeEventType,
            ids: { nodeIds?: string[]; edgeIds?: string[] },
        ) => {
            const event: CanvasChangeEvent = {
                type,
                nodeIds: ids.nodeIds ?? [],
                edgeIds: ids.edgeIds ?? [],
                timestamp: Date.now(),
            };
            // Snapshot the set BEFORE iterating — a subscriber
            // that unsubscribes itself during dispatch must not
            // affect the current dispatch round.
            const current = Array.from(subsRef.current);
            for (const sub of current) {
                try {
                    sub(event);
                } catch {
                    // A misbehaving subscriber must not block
                    // siblings. Swallow + continue; debug-time
                    // visibility is a future log-channel item.
                }
            }
        },
        [],
    );

    const emitGraphReplace = useCallback(
        (snapshot: { nodes: Node[]; edges: Edge[] }) => {
            emit("graph.replace", {
                nodeIds: snapshot.nodes.map((n) => n.id),
                edgeIds: snapshot.edges.map((e) => e.id),
            });
        },
        [emit],
    );

    // Ensure no listeners leak past the consumer's lifetime —
    // even if the consumer forgot to call the unsubscribe
    // returned from `subscribe`, the whole registry tears down
    // when the hook unmounts.
    useEffect(
        () => () => {
            subsRef.current.clear();
        },
        [],
    );

    return { emit, emitGraphReplace, subscribe };
}
