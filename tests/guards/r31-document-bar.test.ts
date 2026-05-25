/**
 * R31 (Bundle 3) — Document bar (PR 1 of the design roadmap).
 *
 * The brutal-verdict review found the Processes page above
 * the canvas carried a CRUD-page header (breadcrumbs +
 * `<Heading level={1}>Processes</Heading>` + description) —
 * three bands of chrome stacked before the working surface
 * ever appeared. A canvas tool announces itself THROUGH the
 * canvas; the document bar inside the editor now carries the
 * breadcrumbs inline (Figma-style).
 *
 * R31 Bundle 1 already retired the CanvasHelpStrip (one of
 * the five bands). Bundle 3 retires:
 *
 *   • The page-level breadcrumbs above the canvas
 *   • The `<Heading level={1}>Processes</Heading>` page title
 *   • The description paragraph
 *
 * Replaced by:
 *
 *   • Inline breadcrumbs (Dashboard › Processes ›) on the
 *     left of the existing canvas toolbar
 *   • `data-canvas-document-bar="true"` marker on the toolbar
 *     so future bundles can target the canonical document
 *     bar without ambiguity
 *
 * The process selector, name input, action cluster, snap
 * toggle, autosave status, version pill, and Save stay in
 * place — every existing testid the R26 / R28 ratchets pin
 * keeps working.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R31 (Bundle 3) — document bar", () => {
    describe("ProcessesClient — page header retired", () => {
        const src = read(
            "src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx",
        );

        it("no longer renders <Heading> or PageBreadcrumbs", () => {
            // The CRUD-page chrome above the canvas is gone. The
            // editor owns its own identity now.
            expect(src).not.toMatch(/<Heading\b/);
            expect(src).not.toMatch(/<PageBreadcrumbs\b/);
        });

        it("no longer mounts WorkspaceShell.Header body content", () => {
            // The header slot itself remains AVAILABLE in the
            // primitive (future canvas-mode chrome may use it),
            // but the page no longer renders it.
            expect(src).not.toMatch(/<WorkspaceShell\.Header\b/);
        });

        it("no longer imports the retired primitives", () => {
            // The retirement comment block intentionally mentions
            // the primitive names — anchor on the actual import
            // statements so the comment is not a false positive.
            expect(src).not.toMatch(/import\s*\{\s*Heading\b/);
            expect(src).not.toMatch(/import\s*\{\s*PageBreadcrumbs\b/);
        });
    });

    describe("PersistedProcessCanvas — inline breadcrumbs in the document bar", () => {
        const src = read(
            "src/components/processes/PersistedProcessCanvas.tsx",
        );

        it("the canonical document-bar marker is set", () => {
            // `data-canvas-document-bar="true"` is the new
            // canonical marker — future bundles (overflow menu,
            // command-palette anchor, etc.) target this element.
            expect(src).toMatch(/data-canvas-document-bar="true"/);
        });

        it("renders an inline <nav> breadcrumb on the toolbar", () => {
            expect(src).toMatch(/data-canvas-document-breadcrumb="true"/);
            // The breadcrumb's accessible name is the canonical
            // 'Breadcrumb' label so screen readers identify it
            // as a navigation landmark.
            expect(src).toMatch(/aria-label="Breadcrumb"/);
        });

        it("breadcrumb links to the tenant dashboard", () => {
            // The dashboard link uses the tenantSlug closure prop
            // (already present in the Inner component's props).
            expect(src).toMatch(
                /href=\{`\/t\/\$\{tenantSlug\}\/dashboard`\}/,
            );
        });

        it("breadcrumb separator uses the standard › character", () => {
            // One typographic separator for the whole canvas.
            // The Unicode `›` (U+203A) — same as the IC PageBreadcrumbs
            // primitive — keeps the navigation language consistent.
            expect(src).toMatch(/›/);
        });

        it("preserves every existing toolbar testid (R26/R28 contract intact)", () => {
            // These testids are pinned by upstream ratchets
            // (R26-PR-E, R28-editor-ergonomics). The document-bar
            // refactor preserves them — the IDs stay so the
            // tests stay green.
            for (const id of [
                "process-selector",
                "process-name-input",
                "new-process-btn",
                "duplicate-process-btn",
                "canvas-undo-btn",
                "canvas-redo-btn",
                "canvas-snap-toggle",
                "autosave-status",
                "save-process-btn",
            ]) {
                expect(src).toMatch(new RegExp(`data-testid="${id}"`));
            }
        });
    });
});
