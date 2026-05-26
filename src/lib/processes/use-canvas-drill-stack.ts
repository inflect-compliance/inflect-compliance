"use client";

/**
 * Epic P6-PR-A — Sub-flow drill-down navigation stack.
 *
 * Closes the brief's #10 🟡 "Sub-Flow Drill-Down" gap. Pre-P6
 * groups were flat containers — every node lived on the root
 * surface regardless of nesting depth. Drill-down lets the user
 * double-click a group to enter it; only that group's
 * descendants render, the rest of the graph hides, and a
 * breadcrumb shows where they are in the hierarchy.
 *
 * State shape:
 *   - `stack: string[]` — group ids from root → deepest. Empty
 *     stack = root view (all top-level nodes visible).
 *   - `currentGroupId` — the deepest group id, or null at root.
 *
 * Why a hook (not a context):
 *   - The drill state is canvas-local. A second canvas mount
 *     (preview, snapshot view) should have its own stack — no
 *     cross-canvas leakage.
 *   - Easy to unit test without standing up a provider.
 *
 * Filtering invariant:
 *   - At root: every node is visible.
 *   - Inside a group: visible nodes are those whose `parentId`
 *     === `currentGroupId`. The group itself is hidden — the
 *     drill IS into the group.
 *
 * Escape binding: uses the shared `useKeyboardShortcut` registry
 * (the `keyboard-shortcut-conventions` guardrail bans raw
 * keydown listeners outside it). Disabled at root so it
 * doesn't fight other Escape consumers (modal close, popover
 * dismiss).
 */

import { useCallback, useState } from "react";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut";

export interface CanvasDrillState {
    /** Group ids from root → deepest. */
    stack: string[];
    /** The deepest group id; null at root. */
    currentGroupId: string | null;
    /** Push a group id onto the stack — drill in. */
    enter: (groupId: string) => void;
    /** Pop the deepest level — drill out one step. */
    exit: () => void;
    /** Reset to root in one step. */
    reset: () => void;
}

export function useCanvasDrillStack(): CanvasDrillState {
    const [stack, setStack] = useState<string[]>([]);
    const enter = useCallback((groupId: string) => {
        setStack((s) => [...s, groupId]);
    }, []);
    const exit = useCallback(() => {
        setStack((s) => (s.length === 0 ? s : s.slice(0, -1)));
    }, []);
    const reset = useCallback(() => {
        setStack([]);
    }, []);
    // Escape pops one level — keyboard parity with Figma /
    // Lucidchart drill-down. Disabled at root so other Escape
    // consumers (modal close, popover dismiss) keep working.
    useKeyboardShortcut("escape", exit, {
        description: "Exit current drill-down level",
        enabled: stack.length > 0,
    });
    return {
        stack,
        currentGroupId: stack.length === 0 ? null : stack[stack.length - 1],
        enter,
        exit,
        reset,
    };
}
