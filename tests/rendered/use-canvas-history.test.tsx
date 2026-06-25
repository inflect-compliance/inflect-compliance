/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useCanvasHistory — branch-coverage tests (JSDOM project).
 *
 * Exercises the undo/redo history stack hook from
 * `src/lib/processes/use-canvas-history.ts`:
 *
 *   • push (clears redo, MAX_DEPTH shift, redo-already-empty branch)
 *   • undo (empty-stack null vs pop-returns-snapshot)
 *   • redo (empty-stack null vs pop-returns-snapshot)
 *   • pushRedo (MAX_DEPTH shift)
 *   • reset (with vs without an initial seed)
 *   • cloneSnapshot (node.data present/absent, edge.data present/absent)
 *   • canUndo / canRedo / depth derived flags
 */
import { act, renderHook } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import {
    useCanvasHistory,
    type CanvasSnapshot,
} from "@/lib/processes/use-canvas-history";

const MAX_DEPTH = 50;

// ─── Fixtures ───────────────────────────────────────────────────────

/**
 * Minimal valid xyflow Node/Edge snapshot. `data` is optional on
 * purpose so individual tests can flip the cloneSnapshot data-present
 * vs data-absent branches.
 */
function snap(
    id: string,
    opts: { nodeData?: boolean; edgeData?: boolean } = {},
): CanvasSnapshot {
    const node = {
        id: `n-${id}`,
        position: { x: 1, y: 2 },
        ...(opts.nodeData !== false
            ? { data: { label: id } }
            : { data: undefined }),
    } as unknown as Node;
    const edge = {
        id: `e-${id}`,
        source: "a",
        target: "b",
        ...(opts.edgeData !== false
            ? { data: { kind: id } }
            : { data: undefined }),
    } as unknown as Edge;
    return { nodes: [node], edges: [edge] };
}

describe("useCanvasHistory", () => {
    // ─── derived flags: empty start ─────────────────────────────────
    it("starts empty: canUndo/canRedo false, depth 0", () => {
        const { result } = renderHook(() => useCanvasHistory());
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
        expect(result.current.depth).toBe(0);
    });

    // ─── push: basic + canUndo flips true ───────────────────────────
    it("push records into past and flips canUndo true, depth increments", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.push(snap("1")));
        expect(result.current.canUndo).toBe(true);
        expect(result.current.depth).toBe(1);
        act(() => result.current.push(snap("2")));
        expect(result.current.depth).toBe(2);
    });

    // ─── undo: empty-stack returns null ─────────────────────────────
    it("undo on an empty past returns null (no-pop branch)", () => {
        const { result } = renderHook(() => useCanvasHistory());
        let out: CanvasSnapshot | null = snap("x");
        act(() => {
            out = result.current.undo();
        });
        expect(out).toBeNull();
    });

    // ─── undo: pop returns the snapshot, LIFO order ─────────────────
    it("undo pops the most-recent snapshot (LIFO) and decrements depth", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.push(snap("1")));
        act(() => result.current.push(snap("2")));
        let out: CanvasSnapshot | null = null;
        act(() => {
            out = result.current.undo();
        });
        expect(out).not.toBeNull();
        expect(out!.nodes[0]!.id).toBe("n-2");
        expect(result.current.depth).toBe(1);
        expect(result.current.canUndo).toBe(true);
        // Pop the last one — canUndo flips back false.
        act(() => {
            out = result.current.undo();
        });
        expect(out!.nodes[0]!.id).toBe("n-1");
        expect(result.current.canUndo).toBe(false);
        expect(result.current.depth).toBe(0);
    });

    // ─── redo: empty-stack returns null ─────────────────────────────
    it("redo on an empty future returns null (no-pop branch)", () => {
        const { result } = renderHook(() => useCanvasHistory());
        let out: CanvasSnapshot | null = snap("x");
        act(() => {
            out = result.current.redo();
        });
        expect(out).toBeNull();
        expect(result.current.canRedo).toBe(false);
    });

    // ─── pushRedo + redo round trip ─────────────────────────────────
    it("pushRedo flips canRedo true and redo pops the snapshot", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.pushRedo(snap("r1")));
        expect(result.current.canRedo).toBe(true);
        let out: CanvasSnapshot | null = null;
        act(() => {
            out = result.current.redo();
        });
        expect(out!.nodes[0]!.id).toBe("n-r1");
        expect(result.current.canRedo).toBe(false);
    });

    // ─── push clears a non-empty redo stack (branch: future>0) ──────
    it("push clears a populated redo stack (new-edit-forks-history)", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.pushRedo(snap("r1")));
        expect(result.current.canRedo).toBe(true);
        act(() => result.current.push(snap("forward")));
        // future was > 0 → cleared.
        expect(result.current.canRedo).toBe(false);
        expect(result.current.canUndo).toBe(true);
    });

    // ─── push leaves an empty redo stack untouched (branch: future==0) ─
    it("push with an already-empty redo stack takes the no-clear branch", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.push(snap("a")));
        // redo was empty; still empty.
        expect(result.current.canRedo).toBe(false);
    });

    // ─── push: MAX_DEPTH cap drops the oldest ───────────────────────
    it("push caps the past stack at MAX_DEPTH, dropping the oldest", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => {
            for (let i = 0; i < MAX_DEPTH + 5; i++) {
                result.current.push(snap(String(i)));
            }
        });
        expect(result.current.depth).toBe(MAX_DEPTH);
        // Oldest (snap "0".."4") shifted off; first undo returns the
        // newest, and we can only undo MAX_DEPTH times.
        let count = 0;
        act(() => {
            while (result.current.undo()) count++;
        });
        expect(count).toBe(MAX_DEPTH);
    });

    // ─── pushRedo: MAX_DEPTH cap drops the oldest ───────────────────
    it("pushRedo caps the future stack at MAX_DEPTH", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => {
            for (let i = 0; i < MAX_DEPTH + 3; i++) {
                result.current.pushRedo(snap(String(i)));
            }
        });
        let count = 0;
        act(() => {
            while (result.current.redo()) count++;
        });
        expect(count).toBe(MAX_DEPTH);
    });

    // ─── reset without initial: both stacks cleared ─────────────────
    it("reset() with no seed clears both stacks", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.push(snap("1")));
        act(() => result.current.pushRedo(snap("2")));
        act(() => result.current.reset());
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
        expect(result.current.depth).toBe(0);
    });

    // ─── reset with initial: seeds the past (branch: initial truthy) ─
    it("reset(initial) seeds the past with one snapshot", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() => result.current.push(snap("old")));
        act(() => result.current.pushRedo(snap("oldredo")));
        act(() => result.current.reset(snap("seed")));
        expect(result.current.depth).toBe(1);
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
        let out: CanvasSnapshot | null = null;
        act(() => {
            out = result.current.undo();
        });
        expect(out!.nodes[0]!.id).toBe("n-seed");
    });

    // ─── cloneSnapshot: data-present branch deep-copies ─────────────
    it("clones node/edge data so mutating the source does not bleed in", () => {
        const { result } = renderHook(() => useCanvasHistory());
        const original = snap("orig", { nodeData: true, edgeData: true });
        act(() => result.current.push(original));
        // Mutate the original AFTER push — the stored clone must be intact.
        (original.nodes[0]!.data as any).label = "MUTATED";
        original.nodes[0]!.position.x = 999;
        (original.edges[0]!.data as any).kind = "MUTATED";
        let out: CanvasSnapshot | null = null;
        act(() => {
            out = result.current.undo();
        });
        expect((out!.nodes[0]!.data as any).label).toBe("orig");
        expect(out!.nodes[0]!.position.x).toBe(1);
        expect((out!.edges[0]!.data as any).kind).toBe("orig");
    });

    // ─── cloneSnapshot: data-absent branch preserves undefined ──────
    it("clones a snapshot whose node/edge data is undefined (falsy branch)", () => {
        const { result } = renderHook(() => useCanvasHistory());
        act(() =>
            result.current.push(snap("nd", { nodeData: false, edgeData: false })),
        );
        let out: CanvasSnapshot | null = null;
        act(() => {
            out = result.current.undo();
        });
        expect(out!.nodes[0]!.data).toBeUndefined();
        expect(out!.edges[0]!.data).toBeUndefined();
    });
});
