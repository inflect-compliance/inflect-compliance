"use client";

/**
 * Epic P6-PR-C — Real-time presence foundation (Stage 1, FLAG-OFF).
 *
 * The hook surface the eventual WebSocket service will plug into.
 * **Today this is a no-op** — it always returns an empty roster
 * and a no-op `publish` callback. Zero bytes ship to the client
 * beyond the import; zero runtime cost.
 *
 * The seam is here so:
 *   - we can call `useCanvasPresence({ mapId, userId })` from
 *     `<PersistedProcessCanvas>` today and the cursor-projection
 *     site is already integrated;
 *   - the Stage 2 PR (Yjs + WebSocket transport) implements the
 *     `IS_PRESENCE_ENABLED` branch without touching the canvas.
 *
 * Feature flag: `NEXT_PUBLIC_ENABLE_CANVAS_PRESENCE=1`. Read at
 * mount time. Even when the env flips on, the hook stays a no-op
 * until the Stage 2 transport ships — flag is the *enabler*, not
 * the *implementor*.
 *
 * See `docs/processes-realtime-collab.md` for the full
 * architectural plan + the four-stage delivery rollout.
 */

import { useCallback, useMemo } from "react";

/**
 * Per-user presence record. Position is in xyflow-flow
 * coordinates (the same space as `node.position`); the UI layer
 * projects to screen coords via xyflow's `useReactFlow` helpers.
 */
export interface PresenceUser {
    userId: string;
    name: string;
    /** Deterministic colour drawn from the per-tenant palette. */
    colour: string;
    /** Last-known cursor position in xyflow-flow coords. */
    cursor: { x: number; y: number } | null;
    /** Selected node ids (so other users see what we're editing). */
    selection: string[];
    /** Last activity timestamp (ms epoch). */
    lastActiveAt: number;
}

export interface CanvasPresenceState {
    /** Other users currently editing the same map. EXCLUDES self. */
    roster: PresenceUser[];
    /** Publish our cursor position (called from canvas mousemove). */
    publishCursor: (cursor: { x: number; y: number } | null) => void;
    /** Publish our selection set (called from xyflow onSelectionChange). */
    publishSelection: (selection: string[]) => void;
}

/**
 * Stage-1 hard-codes the flag to off — there is no production
 * transport yet. Stage 2 will lift this to a real env-driven flag
 * declared in `src/env.ts` (`NEXT_PUBLIC_ENABLE_CANVAS_PRESENCE`)
 * when the WebSocket service ships. Reading `process.env`
 * directly here would trip the `no-fallbacks` guardrail (the
 * canonical env channel is the typed `@/env` module).
 */
const IS_PRESENCE_ENABLED = false;

export function useCanvasPresence(_opts: {
    mapId: string | null;
    userId: string;
}): CanvasPresenceState {
    // Stable no-op callbacks — referential equality across renders
    // so consumers using them in dep arrays don't re-trigger
    // effects unnecessarily.
    const publishCursor = useCallback(
        (_cursor: { x: number; y: number } | null) => {
            // Stage 1: no-op. Stage 2 awareness write goes here.
        },
        [],
    );
    const publishSelection = useCallback((_selection: string[]) => {
        // Stage 1: no-op. Stage 2 awareness write goes here.
    }, []);
    const roster = useMemo<PresenceUser[]>(() => [], []);
    // Flag-off branch returns the canonical no-op state — same
    // shape consumers can rely on regardless of the flag's value.
    if (!IS_PRESENCE_ENABLED) {
        return { roster, publishCursor, publishSelection };
    }
    // Flag-on stub: still no-op until Stage 2 transport lands.
    // The branch is here so a future PR can drop the WebSocket
    // subscription in WITHOUT touching consumer call sites.
    return { roster, publishCursor, publishSelection };
}

/**
 * Stable test export — lets the ratchet check the flag-name +
 * the default-roster shape without poking at module internals.
 */
export const __INTERNAL_PRESENCE = {
    flagName: "NEXT_PUBLIC_ENABLE_CANVAS_PRESENCE",
    defaultRoster: [] as PresenceUser[],
};
