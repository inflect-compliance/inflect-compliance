/**
 * R31 (Bundle 6) — Minimap + zoom controls (PR 7 of the roadmap).
 *
 * Pre-R31 the canvas shipped without a minimap, without a zoom UI,
 * without a "fit to canvas" affordance. On a large process map the
 * user couldn't tell where they were, how much there was, or how
 * to get back. Every canvas tool that has shipped in the last 15
 * years has these. R31 wires xyflow's `<MiniMap>` + `<Controls>`
 * primitives as overlays inside the canvas plane (not new chrome
 * strips above) and tones them to match the canvas frame.
 *
 *   • Bottom-left zoom strip — `<Controls position="bottom-left"
 *     showInteractive={false} />`. The `showInteractive` flag is
 *     OFF deliberately: the "lock interaction" toggle xyflow ships
 *     by default is for graph viewers, not authoring canvases.
 *   • Bottom-right minimap — `<MiniMap position="bottom-right"
 *     pannable zoomable />`. The `nodeColor` callback reads each
 *     node's category so the miniature retains the canvas's
 *     visual hierarchy.
 *
 * Both overlays surface-match the document bar + AsidePanel
 * primitives — `bg-canvas-frame/90`, hairline border,
 * rounded-[8px], backdrop-blur — so they read as part of one
 * coherent chrome language.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R31 (Bundle 6) — minimap + zoom", () => {
    const src = read("src/components/processes/PersistedProcessCanvas.tsx");

    it("imports xyflow's MiniMap + Controls primitives", () => {
        // Both must come from `@xyflow/react`; the imports drive
        // the render branch below. Order-independent — assert
        // each anchor on its own + co-location inside one import.
        const importMatch = src.match(
            /import\s*\{[\s\S]{0,2000}\}\s*from\s*["']@xyflow\/react["']/,
        );
        expect(importMatch).not.toBeNull();
        expect(importMatch![0]).toMatch(/\bMiniMap\b/);
        expect(importMatch![0]).toMatch(/\bControls\b/);
    });

    it("mounts the zoom strip at the bottom-left of the canvas plane", () => {
        // `<Controls position="bottom-left" ...>` — xyflow places
        // the strip absolute-positioned inside its viewport.
        expect(src).toMatch(/<Controls\b[\s\S]{0,400}position="bottom-left"/);
        // The `showInteractive` flag is OFF deliberately — locked
        // here so a future "show the lock toggle" PR has to make
        // the case in writing.
        expect(src).toMatch(/showInteractive=\{false\}/);
        // Token-driven surface so the overlay matches the canvas
        // frame language.
        expect(src).toMatch(
            /<Controls\b[\s\S]{0,500}bg-canvas-frame\/90/,
        );
        expect(src).toMatch(
            /data-testid="canvas-zoom-controls"/,
        );
    });

    it("mounts the minimap at the bottom-right of the canvas plane", () => {
        expect(src).toMatch(/<MiniMap\b[\s\S]{0,400}position="bottom-right"/);
        // The minimap is pannable + zoomable so the user can use
        // it as a navigation surface, not just a wayfinder.
        expect(src).toMatch(/<MiniMap\b[\s\S]{0,400}pannable/);
        expect(src).toMatch(/<MiniMap\b[\s\S]{0,400}zoomable/);
        expect(src).toMatch(/data-testid="canvas-minimap"/);
    });

    it("the minimap colours nodes by category (mirrors canvas hierarchy)", () => {
        // `nodeColor={(n) => …}` reads `data.kind` and returns a
        // token-backed colour. The miniature shouldn't be a
        // colour-by-id rainbow; it should rhyme with the canvas.
        expect(src).toMatch(
            /<MiniMap\b[\s\S]{0,800}nodeColor=\{[\s\S]{0,400}data as[\s\S]{0,200}kind/,
        );
    });

    it("both overlays surface-match the canvas chrome language", () => {
        // bg-canvas-frame/90 + border-canvas-border + rounded-[8px]
        // + backdrop-blur — same set the document bar + AsidePanel
        // use elsewhere in the canvas. The overlay vocabulary is
        // one language, not a per-overlay invention.
        expect(src).toMatch(
            /<Controls\b[\s\S]{0,500}rounded-\[8px\]/,
        );
        expect(src).toMatch(
            /<MiniMap\b[\s\S]{0,500}rounded-\[8px\]/,
        );
        expect(src).toMatch(
            /<Controls\b[\s\S]{0,500}backdrop-blur/,
        );
        expect(src).toMatch(
            /<MiniMap\b[\s\S]{0,500}backdrop-blur/,
        );
    });
});
