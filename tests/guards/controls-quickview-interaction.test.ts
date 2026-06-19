/**
 * Controls PR-3 — TidalControl interaction ratchet.
 *
 * Locks the full Controls table interaction so it can't silently regress
 * (mirrors the Assets `item-27-32-34-asset-ux` lock):
 *   - single-click the row → SELECT (selection wired)
 *   - single-click the NAME → control quick-view side panel (the name is a
 *     <button> that opens it, NOT a nav link)
 *   - double-click the row → full detail page (onRowClick → /controls/:id)
 *   - a control's tasks expand inline (PR-1) and clicking a task → task
 *     quick-view; both quick-views render in the responsive AsidePanel
 *   - tasks are listed ONLY inline in the table, never inside the control
 *     quick-view panel (PR-4 product decision: tasks live below the control
 *     in the table, not in the sidebar)
 *   - Escape closes the quick-view (≥xl rail); Sheet owns it < xl
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const controls = read("src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx");
const quick = read("src/app/t/[tenantSlug]/(app)/controls/ControlQuickView.tsx");
const taskq = read("src/app/t/[tenantSlug]/(app)/controls/TaskQuickView.tsx");
const aside = read("src/components/ui/aside-panel.tsx");

describe("Controls quick-view interaction (TidalControl)", () => {
    it("the title cell is a <button> that opens the quick-view, not a nav link", () => {
        // A <button> (skipped by isClickOnInteractiveChild) calling the opener.
        expect(controls).toMatch(/onClick=\{[\s\S]{0,80}openControlQuickView\(row\.original\)/);
        expect(controls).toMatch(/data-testid={`control-title-/);
        // The opener sets the selected control (drives the panel).
        expect(controls).toMatch(/openControlQuickView = useCallback/);
    });

    it("clicking the name also expands the inline task rows (tasks list below the control)", () => {
        // PR-4: name-click surfaces the related tasks inline in the table —
        // openControlQuickView + toggleExpanded(true) in the same handler.
        expect(controls).toMatch(
            /openControlQuickView\(row\.original\);[\s\S]{0,120}row\.toggleExpanded\(true\)/,
        );
    });

    it("row selection stays on (single-click selects)", () => {
        // Controls wires selection (default-on select column) — never opts out.
        expect(controls).not.toMatch(/selectionEnabled=\{?false/);
        expect(controls).toMatch(/onRowSelectionChange/);
    });

    it("double-click the row navigates to the full detail page", () => {
        expect(controls).toMatch(/onRowClick: handleRowClick/);
        expect(controls).toMatch(/handleRowClick[\s\S]{0,120}\/controls\/\$\{row\.original\.id\}/);
    });

    it("both quick-views mount + tasks open the task quick-view", () => {
        expect(controls).toMatch(/<ControlQuickView/);
        expect(controls).toMatch(/<TaskQuickView/);
        expect(controls).toMatch(/onTaskClick=\{setSelectedTask\}/);
    });

    it("tasks live ONLY inline in the table, never in the control quick-view panel", () => {
        // The inline aligned sub-rows own the task list + click target.
        expect(controls).toMatch(/renderAlignedSubRows:\s*renderControlTaskSubRows/);
        // The control quick-view panel renders no task list — it must not
        // import or mount <ControlTaskRows> (tasks belong in the table).
        expect(quick).not.toMatch(/ControlTaskRows/);
        expect(quick).not.toMatch(/onTaskClick/);
    });

    it("the quick-view surfaces in the responsive AsidePanel (openOnMount + onClose)", () => {
        expect(controls).toMatch(/<AsidePanel[\s\S]{0,200}openOnMount[\s\S]{0,200}onClose=\{closeQuickView\}/);
        // The primitive supports the runtime-open + dismiss hooks.
        expect(aside).toMatch(/openOnMount/);
        expect(aside).toMatch(/onClose\?\:/);
    });

    it("the quick-view AsidePanels carry distinct keys so openOnMount re-fires (task click opens reliably)", () => {
        // Regression guard: without distinct keys React reuses the in-place
        // AsidePanel when switching browse→quick-view or control→task, so
        // openOnMount (a mount-only effect) never fires and a clicked task
        // silently fails to open the rail.
        expect(controls).toMatch(/key="qv-task"/);
        expect(controls).toMatch(/key="qv-control"/);
    });

    it("the control name button shows the hand cursor (cursor-pointer)", () => {
        // The name is a <button> (default arrow cursor); Risk's <Link> gets the
        // pointer for free. Match Risk by adding cursor-pointer to the name
        // button's canonical className.
        expect(controls).toMatch(/inline-block max-w-full cursor-pointer truncate/);
    });

    it("inline task rows are a cursor-pointer whole-row button + show category/owner/evidence", () => {
        const taskRows = read("src/app/t/[tenantSlug]/(app)/controls/ControlTaskRows.tsx");
        expect(taskRows).toMatch(/cursor-pointer/);
        // Whole-row button (not just the title) carries the click + testid.
        expect(taskRows).toMatch(/data-task-quickview=\{t\.id\}/);
        // Inherited category + owner + evidence count are displayed.
        expect(taskRows).toMatch(/controlCategory/);
        expect(taskRows).toMatch(/_count\?\.evidence/);
        expect(taskRows).toMatch(/evidence/);
    });

    it("Escape closes the quick-view", () => {
        expect(controls).toMatch(/useKeyboardShortcut\(\[['"]Escape['"]\], closeQuickView/);
    });

    it("the quick-views are accessible regions with a full-view escape + close", () => {
        expect(quick).toMatch(/role="region"/);
        expect(quick).toMatch(/control-quickview-fullview/);
        expect(quick).toMatch(/aria-label="Close quick view"/);
        expect(taskq).toMatch(/role="region"/);
        expect(taskq).toMatch(/task-quickview-fullview/);
        expect(taskq).toMatch(/data-testid="task-quickview-back"/);
    });
});
