/**
 * Control detail page — Tasks tab — "+ Task" creation flow MUST
 * be modal, not in-page.
 *
 * Pre-this-PR the "+ Task" button toggled an inline `<form>` block
 * that sat above the Tasks DataTable, competing with the rows for
 * attention. The canonical pattern (see docs/modal-sheet-strategy.md)
 * is "create-flow in a modal" — the table stays at rest while the
 * user fills out the form in a focused overlay.
 *
 * This ratchet locks that decision so a future refactor that
 * inlines the form again trips CI with a written rationale. Pairs
 * with the queued modal-form roadmap (memory:
 * project_modal_form_roadmap) — the control task path is the
 * first concrete realisation of P1.
 *
 * The ratchet asserts THREE things:
 *
 *   1. The sibling modal component exists at `_modals/`
 *      following the EditControlModal extraction pattern.
 *   2. The page imports + mounts it (no inline `<form>` block
 *      with the canonical task-form testids).
 *   3. The "+ Task" button opens the modal (`setShowTaskForm(true)`)
 *      instead of toggling a boolean. A future toggle pattern
 *      would re-introduce a chrome state where the form is
 *      ambiguously visible / closing.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf-8");

const PAGE_PATH =
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx";
const MODAL_PATH =
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_modals/NewControlTaskModal.tsx";

describe("Control task creation — modal-only", () => {
    describe("Sibling modal component exists", () => {
        const src = () => read(MODAL_PATH);

        it("file exists at the canonical _modals/ path", () => {
            expect(existsSync(path.join(ROOT, MODAL_PATH))).toBe(true);
        });

        it("exports NewControlTaskModal with the canonical props", () => {
            const s = src();
            expect(s).toMatch(/export function NewControlTaskModal/);
            // Five state-bound prop pairs the page wires (title /
            // description / dueAt / open / saving) — locking the
            // prop surface prevents a refactor that drops one and
            // leaves the page with a stale binding.
            for (const prop of [
                "open",
                "setOpen",
                "title",
                "setTitle",
                "description",
                "setDescription",
                "dueAt",
                "setDueAt",
                "saving",
                "onSubmit",
                "onCancel",
            ]) {
                expect(s).toMatch(new RegExp(`\\b${prop}\\b`));
            }
        });

        it("uses the shared <Modal> primitive (not a hand-rolled overlay)", () => {
            const s = src();
            expect(s).toMatch(
                /import\s*\{\s*Modal\s*\}\s*from\s+['"]@\/components\/ui\/modal['"]/,
            );
            // The four canonical Modal slots — a refactor that
            // dropped Modal.Form would lose the submit-on-Enter
            // contract, dropping Modal.Actions would lose the
            // pinned-footer layout.
            expect(s).toMatch(/<Modal\.Header\b/);
            expect(s).toMatch(/<Modal\.Form\b/);
            expect(s).toMatch(/<Modal\.Body\b/);
            expect(s).toMatch(/<Modal\.Actions\b/);
        });

        it("renders the three form fields with their canonical testids", () => {
            const s = src();
            // The page wires these testids — Playwright tests
            // (existing + future) anchor on them.
            expect(s).toMatch(/data-testid="task-title-input"/);
            expect(s).toMatch(/data-testid="task-desc-input"/);
            expect(s).toMatch(/data-testid="submit-task-btn"/);
        });

        it("preventDefaultClose during in-flight save", () => {
            // Without this, the user could backdrop-click the modal
            // mid-POST and lose unsaved fields. The Edit modal uses
            // the same pattern.
            const s = src();
            expect(s).toMatch(/preventDefaultClose=\{saving\}/);
        });
    });

    describe("Page wires the modal (no inline form)", () => {
        const src = () => read(PAGE_PATH);

        it("imports the sibling modal", () => {
            expect(src()).toMatch(
                /import\s*\{\s*NewControlTaskModal\s*\}\s*from\s+['"]\.\/_modals\/NewControlTaskModal['"]/,
            );
        });

        it("mounts <NewControlTaskModal> in the Tasks tab", () => {
            expect(src()).toMatch(/<NewControlTaskModal\b/);
        });

        it("'+ Task' button OPENS the modal (no toggle pattern)", () => {
            // The pre-PR pattern was `onClick={() => setShowTaskForm(!showTaskForm)}`
            // — toggle semantics that get confused when the modal
            // closes itself on submit. Lock the explicit `true`
            // open call.
            const s = src();
            expect(s).toMatch(
                /onClick=\{\(\)\s*=>\s*setShowTaskForm\(true\)\}/,
            );
            expect(s).not.toMatch(
                /setShowTaskForm\(!showTaskForm\)/,
            );
        });

        it("no inline <form> block with the task-title input testid", () => {
            // The old inline form lives inside a `<form>` element
            // that wraps the title input. Now the title input
            // lives inside <Modal.Form>. Locking that no <form>
            // element in page.tsx contains `task-title-input`
            // catches a regression that tries to bring the inline
            // form back.
            const s = src();
            // The page MAY contain other <form> blocks (file upload,
            // evidence link). Scope the assertion to forms that
            // contain the task-title-input testid.
            const formMatches = s.match(/<form[\s\S]*?<\/form>/g) ?? [];
            for (const formBlock of formMatches) {
                expect(formBlock).not.toMatch(
                    /data-testid="task-title-input"/,
                );
                expect(formBlock).not.toMatch(/id="task-title-input"/);
            }
        });

        it("page no longer imports DatePicker (lived only in the old inline form)", () => {
            // DatePicker / parseYMD / toYMD / startOfUtcDay all
            // moved into NewControlTaskModal. Keeping them in the
            // page's import list is dead weight — a refactor that
            // brings them back hints at a re-introduction of the
            // inline form.
            const s = src();
            expect(s).not.toMatch(
                /import\s*\{\s*DatePicker\s*\}\s*from\s+['"]@\/components\/ui\/date-picker\/date-picker['"]/,
            );
        });
    });
});
