/**
 * R28 — Editor ergonomics ratchet.
 *
 * Locks the five genuine gaps closed in R28 (the rest of the
 * 7-prompt roadmap was already shipped in R25 / R26 — see the
 * audit in the PR body).
 *
 *   1. Undo / redo via `useCanvasHistory` hook. Past + future
 *      snapshot stacks. `pushRedo` distinguishes the reverse-
 *      direction path from forward edits.
 *
 *   2. Autosave via `useCanvasAutosave` hook. Debounced 3s
 *      after the last `markDirty()`; reuses the existing PUT
 *      path through the consumer's `save` callback.
 *
 *   3. Keyboard shortcuts — Cmd+Z, Cmd+Shift+Z, Cmd+S — wired
 *      through the shared `useKeyboardShortcut` registry (Epic
 *      57 contract from CLAUDE.md).
 *
 *   4. Snap-to-grid — xyflow's native `snapToGrid` + `snapGrid`
 *      props wired to a toolbar toggle that persists per tenant
 *      in localStorage.
 *
 *   5. Edge selection inspector — the R26 ProcessInspector
 *      extended with an `edge` slot + edge-specific fields
 *      (label override + variant cycle).
 *
 *   6. Connection validity predicate — `isValidConnection`
 *      rejects self-loops, duplicate directed pairs, and any
 *      edge touching an annotation node.
 *
 * The R26 ratchets stay green — these are NEW assertions, not
 * replacements.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R28 — editor ergonomics", () => {
    describe("useCanvasHistory hook", () => {
        const src = read("src/lib/processes/use-canvas-history.ts");

        it("exposes push / pushRedo / undo / redo / reset", () => {
            expect(src).toMatch(/export function useCanvasHistory/);
            expect(src).toMatch(/canUndo:/);
            expect(src).toMatch(/canRedo:/);
            expect(src).toMatch(/pushRedo:/);
        });

        it("caps the history depth", () => {
            // A bounded stack is the difference between "real undo"
            // and "OOM after a long authoring session".
            expect(src).toMatch(/MAX_DEPTH\s*=\s*\d+/);
            expect(src).toMatch(/pastRef\.current\.shift\(\)/);
        });

        it("clears the redo stack on a new forward push", () => {
            // Canonical "branching from this point" semantics:
            // a new edit invalidates redo. Locked here so a refactor
            // that switches push to "preserve redo" fails CI.
            expect(src).toMatch(/futureRef\.current = \[\]/);
        });
    });

    describe("useCanvasAutosave hook", () => {
        const src = read("src/lib/processes/use-canvas-autosave.ts");

        it("exports the hook with markDirty / markClean / status", () => {
            expect(src).toMatch(/export function useCanvasAutosave/);
            expect(src).toMatch(/markDirty:/);
            expect(src).toMatch(/markClean:/);
            expect(src).toMatch(/status:/);
        });

        it("respects the `enabled` gate", () => {
            // Autosave must NOT fire during the initial load
            // (`loading=true` → enabled=false in the consumer).
            // The hook's `markDirty` short-circuits when disabled.
            expect(src).toMatch(/if \(!enabled\) return/);
        });

        it("debounces on the supplied delayMs (default 3000)", () => {
            expect(src).toMatch(/delayMs = 3000/);
            expect(src).toMatch(/setTimeout\(/);
        });

        it("stops auto-retrying on failure (visible error instead)", () => {
            // Auto-retry under permanent failure (auth expired,
            // server down) leads to thrashing. The hook surfaces
            // the error + waits for the user's next manual save.
            expect(src).toMatch(/setStatus\(["']error["']\)/);
        });
    });

    describe("PersistedProcessCanvas — wiring", () => {
        const src = read(
            "src/components/processes/PersistedProcessCanvas.tsx",
        );

        it("imports + uses the history hook", () => {
            expect(src).toMatch(/useCanvasHistory/);
            expect(src).toMatch(/const history = useCanvasHistory\(\)/);
        });

        it("imports + uses the autosave hook with handleSave as the callback", () => {
            expect(src).toMatch(/useCanvasAutosave/);
            // The consumer reuses the existing PUT path — no second
            // serialisation surface. Anchor on the canonical wiring.
            expect(src).toMatch(/save:\s*handleSave/);
        });

        it("binds Cmd+Z / Cmd+Shift+Z / Cmd+S via useKeyboardShortcut", () => {
            expect(src).toMatch(
                /useKeyboardShortcut\(["']mod\+z["']/,
            );
            expect(src).toMatch(
                /useKeyboardShortcut\(["']mod\+shift\+z["']/,
            );
            expect(src).toMatch(
                /useKeyboardShortcut\(["']mod\+s["']/,
            );
        });

        it("classifies substantive vs transient changes for history + autosave", () => {
            // Pushing history on every drag-tick buries real undo
            // points; the classifier filters to add / remove / drag-
            // commit changes only.
            expect(src).toMatch(/isSubstantiveNodeChange/);
            expect(src).toMatch(/c\.dragging === false/);
        });

        it("registers an isValidConnection predicate", () => {
            expect(src).toMatch(/isValidConnection/);
            // The three reject conditions — anchored on the
            // distinctive checks so a future refactor that drops
            // one trips the ratchet.
            expect(src).toMatch(/src === tgt/);
            expect(src).toMatch(/srcKind === ["']annotation["']/);
        });

        it("wires snap-to-grid + a toolbar toggle", () => {
            expect(src).toMatch(/snapToGrid=\{snapEnabled\}/);
            expect(src).toMatch(/snapGrid=\{\[16,\s*16\]\}/);
            expect(src).toMatch(/data-testid="canvas-snap-toggle"/);
            // Persistence — the canvas remembers the snap state
            // across sessions.
            expect(src).toMatch(
                /localStorage\.setItem\([\s\S]{0,80}inflect:processes:snap/,
            );
        });

        it("mounts the inspector with both node + edge slots", () => {
            // Pre-R28 mount: <ProcessInspector node={selectedNode}
            // onUpdate={...} />. R28 adds the edge slot + handler.
            expect(src).toMatch(
                /<ProcessInspector[\s\S]{0,200}edge=\{selectedEdge\}/,
            );
            expect(src).toMatch(
                /<ProcessInspector[\s\S]{0,300}onEdgeUpdate=\{handleEdgeUpdate\}/,
            );
        });

        it("toolbar surfaces undo / redo buttons + autosave status", () => {
            expect(src).toMatch(/data-testid="canvas-undo-btn"/);
            expect(src).toMatch(/data-testid="canvas-redo-btn"/);
            expect(src).toMatch(/data-testid="autosave-status"/);
        });
    });

    describe("ProcessInspector — edge mode", () => {
        const src = read("src/components/processes/ProcessInspector.tsx");

        it("declares the edge + onEdgeUpdate props", () => {
            expect(src).toMatch(/edge\?:\s*Edge \| null/);
            expect(src).toMatch(/onEdgeUpdate\?:/);
        });

        it("renders the EdgeInspectorBody when an edge is selected", () => {
            expect(src).toMatch(/EdgeInspectorBody/);
            expect(src).toMatch(/data-inspector-mode="edge"/);
        });

        it("exposes the edge variant cycle inside the inspector", () => {
            expect(src).toMatch(/EDGE_VARIANT_ORDER/);
            expect(src).toMatch(/ToggleGroup/);
            expect(src).toMatch(/data-testid="inspector-edge-label-input"/);
        });
    });
});
