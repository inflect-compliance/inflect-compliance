/**
 * Controls side-panel interaction ratchet (editable panel redesign, 2026-06).
 *
 * Locks the full Controls table → side-panel interaction:
 *   - single-click the row → SELECT (selection wired)
 *   - single-click the NAME → editable control panel + expands inline tasks
 *   - double-click the row → full detail page
 *   - click an inline task → editable task panel
 *   - both panels render in the docked <AsidePanel> (NO overlay/blur → the
 *     table stays visible); Escape closes
 *   - the panels are EDIT-FIRST (form + Save); the control panel's old "Intent"
 *     field is replaced by an evidence-upload box; each panel has an Activity
 *     tab. There is NO separate quick-edit button and NO edit Sheet.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const controls = read("src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx");
const editPanel = read("src/app/t/[tenantSlug]/(app)/controls/ControlEditPanel.tsx");
const taskPanel = read("src/app/t/[tenantSlug]/(app)/controls/TaskEditPanel.tsx");
const aside = read("src/components/ui/aside-panel.tsx");
const sheet = read("src/components/ui/sheet.tsx");

describe("Controls editable side-panel interaction", () => {
    it("the title cell is a <button> that opens the panel + expands inline tasks", () => {
        expect(controls).toMatch(/onClick=\{[\s\S]{0,80}openControlQuickView\(row\.original\)/);
        expect(controls).toMatch(/data-testid={`control-title-/);
        expect(controls).toMatch(/openControlQuickView\(row\.original\);[\s\S]{0,120}row\.toggleExpanded\(true\)/);
    });

    it("row selection stays on; double-click opens the full detail page", () => {
        expect(controls).not.toMatch(/selectionEnabled=\{?false/);
        expect(controls).toMatch(/onRowSelectionChange/);
        expect(controls).toMatch(/onRowClick: handleRowClick/);
        expect(controls).toMatch(/handleRowClick[\s\S]{0,120}\/controls\/\$\{row\.original\.id\}/);
    });

    it("the EDITABLE panels mount (not the old read-only quick-views)", () => {
        expect(controls).toMatch(/<ControlEditPanel/);
        expect(controls).toMatch(/<TaskEditPanel/);
        expect(controls).not.toMatch(/<ControlQuickView/);
        expect(controls).not.toMatch(/<TaskQuickView/);
        // Clicking an inline task opens the task panel; saving refreshes the list.
        expect(controls).toMatch(/onTaskClick=\{setSelectedTask\}/);
        expect(controls).toMatch(/onSaved=\{handlePanelSaved\}/);
    });

    it("the panels surface in the responsive AsidePanel keyed by entity id", () => {
        expect(controls).toMatch(/<AsidePanel[\s\S]{0,400}openOnMount[\s\S]{0,200}onClose=\{closeQuickView\}/);
        // Keyed by ID (not just type) so switching control→control forces a
        // fresh mount → the panel re-seeds from the newly-clicked row.
        expect(controls).toMatch(/key=\{`qv-task-\$\{selectedTask\.id\}`\}/);
        expect(controls).toMatch(/key=\{`qv-control-\$\{selectedControl\.id\}`\}/);
    });

    it("Escape closes the panel", () => {
        expect(controls).toMatch(/useKeyboardShortcut\(\[['"]Escape['"]\], closeQuickView/);
    });

    it("the edit button (quick-edit column) and edit Sheet are REMOVED", () => {
        expect(controls).not.toMatch(/control-quick-edit-/);
        expect(controls).not.toMatch(/<ControlDetailSheet/);
        expect(controls).not.toMatch(/setSheetControlId/);
    });

    describe("control panel = editable + evidence (replaces Intent) + Activity tab", () => {
        it("is an edit form with a Save action", () => {
            expect(editPanel).toMatch(/data-testid="control-edit-form"/);
            expect(editPanel).toMatch(/data-testid="control-edit-save"/);
            expect(editPanel).toMatch(/method:\s*["']PATCH["']/);
            expect(editPanel).toMatch(/role="region"/);
        });
        it("replaces the Intent field with an evidence-upload box", () => {
            expect(editPanel).toMatch(/data-testid="control-evidence-box"/);
            expect(editPanel).toMatch(/evidence\/uploads/);
            // No intent FORM field (old id / state / label) — only the comment
            // may mention the word, so match the field shapes, not "Intent".
            expect(editPanel).not.toMatch(/sheet-intent-input/);
            expect(editPanel).not.toMatch(/panel-intent/);
            expect(editPanel).not.toMatch(/\bintent:\s*draft|form\.intent|update\('intent'/);
        });
        it("has an Activity tab backed by the activity feed", () => {
            expect(editPanel).toMatch(/PanelActivityFeed/);
            expect(editPanel).toMatch(/\/controls\/\$\{control\.id\}\/activity/);
            expect(editPanel).toMatch(/label: "Activity"/);
        });
    });

    describe("task panel = editable + Activity tab", () => {
        it("is an edit form with a Save action", () => {
            expect(taskPanel).toMatch(/data-testid="task-edit-form"/);
            expect(taskPanel).toMatch(/data-testid="task-edit-save"/);
            expect(taskPanel).toMatch(/method:\s*["']PATCH["']/);
            expect(taskPanel).toMatch(/role="region"/);
        });
        it("has an Activity tab backed by the activity feed", () => {
            expect(taskPanel).toMatch(/PanelActivityFeed/);
            expect(taskPanel).toMatch(/\/tasks\/\$\{task\.id\}\/activity/);
        });
    });

    it("the AsidePanel does NOT blur/dim the table (no-blur overlay)", () => {
        // The Sheet primitive accepts an overlay override; the AsidePanel
        // passes a transparent one so the page (table) stays visible.
        expect(sheet).toMatch(/overlayClassName/);
        expect(aside).toMatch(/overlayClassName="fixed inset-0 z-40"/);
    });

    it("openOnMount opens the Sheet ONLY below xl (≥xl uses the docked rail, no overlay)", () => {
        // The bug this locks: opening the Sheet on ≥xl too floated a
        // full-viewport overlay over the table that swallowed the next
        // click, forcing a close-then-reopen to switch rows. ≥xl now relies
        // solely on the docked rail.
        expect(aside).toMatch(/max-width:\s*1279\.98px/);
        expect(aside).toMatch(/if\s*\(belowXl\)\s*setSheetOpen\(true\)/);
    });
});
