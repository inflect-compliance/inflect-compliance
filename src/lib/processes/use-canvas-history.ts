"use client";

/**
 * R28 — Canvas undo/redo history.
 *
 * A small history stack of `{ nodes, edges }` snapshots driving
 * undo / redo for the Processes canvas. Designed to match the
 * xyflow state model:
 *
 *   • The canvas owns `nodes` + `edges` as React state. The hook
 *     receives writers (`setNodes`, `setEdges`) so it can replay
 *     a snapshot atomically.
 *
 *   • Snapshots are PUSHED externally by the canvas after a
 *     substantive change (node added, deleted, repositioned, edge
 *     created, label edited). The hook does NOT auto-snapshot on
 *     every render — that would record one entry per drag-tick
 *     and bury real undo points.
 *
 *   • Redo is the symmetric stack — `undo()` pops from `past` to
 *     `future`; `redo()` reverses. A fresh `push()` clears the
 *     redo stack (the standard "new edit forks history" rule).
 *
 *   • Capped at MAX_DEPTH = 50 entries. Oldest dropped first.
 *     Each entry is a structured-cloned snapshot — cheap for the
 *     bounded graph sizes the Processes page targets.
 *
 * Why not store full xyflow state (including viewport)?
 *   The viewport (pan/zoom) is interaction state, not document
 *   state — undoing a pan would feel wrong. We restore only the
 *   graph structure + node data.
 *
 * Keyboard wiring lives in the consumer (PersistedProcessCanvas),
 * not here — the hook is the data layer; bindings are a UI
 * concern handled via `useKeyboardShortcut`.
 */

import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

const MAX_DEPTH = 50;

interface Snapshot {
    nodes: Node[];
    edges: Edge[];
}

export interface CanvasHistoryApi {
    /** Record a forward edit. Clears the redo stack. */
    push: (snapshot: Snapshot) => void;
    /**
     * Record the live state into the redo stack before applying
     * an undo. Distinct from `push` — `push` is for forward edits
     * and invalidates redo; `pushRedo` preserves the reverse path.
     */
    pushRedo: (snapshot: Snapshot) => void;
    undo: () => Snapshot | null;
    redo: () => Snapshot | null;
    reset: (initial?: Snapshot) => void;
    canUndo: boolean;
    canRedo: boolean;
    depth: number;
}

function cloneSnapshot(s: Snapshot): Snapshot {
    // Avoid `structuredClone` for the JS Node/Edge shape — xyflow
    // attaches non-cloneable React-state metadata on `data` in some
    // edge cases (callbacks, refs). A two-level structural copy
    // covers the persisted fields we care to restore (position,
    // data, type, source/target, label, etc.) without rejecting
    // the snapshot.
    return {
        nodes: s.nodes.map((n) => ({
            ...n,
            position: { ...n.position },
            data: n.data ? { ...(n.data as object) } : n.data,
        })),
        edges: s.edges.map((e) => ({
            ...e,
            data: e.data ? { ...(e.data as object) } : e.data,
        })),
    };
}

export function useCanvasHistory(): CanvasHistoryApi {
    // Two stacks; the "current" graph lives in the canvas state.
    // Past = entries to undo TO; future = entries to redo INTO.
    const pastRef = useRef<Snapshot[]>([]);
    const futureRef = useRef<Snapshot[]>([]);
    // Render trigger so canUndo/canRedo update in the consumer.
    const [, setTick] = useState(0);
    const bump = useCallback(() => setTick((t) => (t + 1) & 0xffff), []);

    const push = useCallback(
        (snapshot: Snapshot) => {
            pastRef.current.push(cloneSnapshot(snapshot));
            if (pastRef.current.length > MAX_DEPTH) {
                pastRef.current.shift();
            }
            // A new edit invalidates the redo stack — the
            // canonical "branching from this point" semantics.
            if (futureRef.current.length > 0) {
                futureRef.current = [];
            }
            bump();
        },
        [bump],
    );

    const undo = useCallback((): Snapshot | null => {
        const last = pastRef.current.pop();
        if (!last) return null;
        // Caller is responsible for snapshotting the CURRENT
        // state into the redo stack before applying — that way
        // we always have a single source of truth (the canvas)
        // for the live snapshot.
        // NOTE: we don't push the current state here because we
        // don't have it. The consumer is expected to push the
        // pre-undo state to `redoStash` (see `pushRedo`).
        bump();
        return last;
    }, [bump]);

    const redo = useCallback((): Snapshot | null => {
        const next = futureRef.current.pop();
        if (!next) return null;
        bump();
        return next;
    }, [bump]);

    // The consumer pushes the pre-undo state here so a subsequent
    // redo can restore it. Kept distinct from `push` — `push` is
    // for forward edits and clears the redo stack; `pushRedo` is
    // for the reverse direction.
    const pushRedo = useCallback(
        (snapshot: Snapshot) => {
            futureRef.current.push(cloneSnapshot(snapshot));
            if (futureRef.current.length > MAX_DEPTH) {
                futureRef.current.shift();
            }
            bump();
        },
        [bump],
    );

    const reset = useCallback(
        (initial?: Snapshot) => {
            pastRef.current = [];
            futureRef.current = [];
            if (initial) {
                // Seed the past so the very next edit has
                // somewhere to undo back to.
                pastRef.current.push(cloneSnapshot(initial));
            }
            bump();
        },
        [bump],
    );

    return {
        push,
        pushRedo,
        undo,
        redo,
        reset,
        canUndo: pastRef.current.length > 0,
        canRedo: futureRef.current.length > 0,
        depth: pastRef.current.length,
    };
}

export type { Snapshot as CanvasSnapshot };
