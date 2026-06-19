/**
 * Controls PR-2/PR-4 — control + task quick-view panels.
 *
 * ControlQuickView renders a condensed control summary (from row data, no
 * fetch). Tasks are NOT listed in the panel — they live inline in the table
 * (ControlTaskRows); clicking an inline task fires onTaskClick, which opens the
 * task quick-view. TaskQuickView renders from the passed task object with
 * back + close + full-view affordances.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";

// Tenant href hook → identity-ish so links render.
jest.mock("@/lib/tenant-context-provider", () => ({
    useTenantHref: () => (p: string) => `/t/acme${p}`,
}));

import { ControlQuickView } from "@/app/t/[tenantSlug]/(app)/controls/ControlQuickView";
import { ControlTaskRows } from "@/app/t/[tenantSlug]/(app)/controls/ControlTaskRows";
import { TaskQuickView } from "@/app/t/[tenantSlug]/(app)/controls/TaskQuickView";

const CONTROL = {
    id: "c1",
    code: "A.1",
    name: "Access control policy",
    description: "Controls access to systems.",
    status: "IN_PROGRESS",
    category: "Access Control",
    owner: { name: "Dana Lee", email: "dana@x.io" },
    taskTotal: 2,
    taskDone: 1,
};

const TASK = {
    id: "t1",
    key: "TSK-9",
    title: "Implement SSO enforcement",
    status: "OPEN",
    severity: "HIGH",
    assignee: { name: "Sam Ray" },
    _count: { evidence: 3 },
};

describe("ControlQuickView", () => {
    it("renders the control summary + full-view link", () => {
        render(<ControlQuickView control={CONTROL} onClose={jest.fn()} />);
        expect(screen.getByTestId("control-quickview")).toBeInTheDocument();
        // a11y — the panel is an announced region (PR-3).
        expect(
            screen.getByRole("region", { name: "Control quick view" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Access control policy")).toBeInTheDocument();
        expect(screen.getByText("Controls access to systems.")).toBeInTheDocument();
        expect(screen.getByText("Dana Lee")).toBeInTheDocument();
        expect(screen.getByTestId("control-quickview-fullview")).toHaveAttribute(
            "href",
            "/t/acme/controls/c1",
        );
    });

    it("does NOT list tasks in the panel — they live inline in the table", () => {
        render(<ControlQuickView control={CONTROL} onClose={jest.fn()} />);
        // The task title belongs to ControlTaskRows (the table), never the panel.
        expect(screen.queryByText("Implement SSO enforcement")).not.toBeInTheDocument();
    });

    it("close button fires onClose", () => {
        const onClose = jest.fn();
        render(<ControlQuickView control={CONTROL} onClose={onClose} />);
        fireEvent.click(screen.getByRole("button", { name: /close quick view/i }));
        expect(onClose).toHaveBeenCalled();
    });
});

describe("ControlTaskRows (aligned inline sub-rows → quick-view)", () => {
    beforeEach(() => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => [TASK],
        })) as unknown as typeof fetch;
    });

    // ControlTaskRows now renders REAL <tr>/<td> rows (aligned to the parent
    // columns), so it must mount inside a <table><tbody>. Column ids mirror the
    // controls table's visible columns.
    const COLUMN_IDS = ["select", "name", "category", "status", "owner", "evidence", "menu"];
    const renderRows = (onTaskClick = jest.fn()) => {
        const utils = render(
            <table>
                <tbody>
                    <ControlTaskRows
                        tenantSlug="acme"
                        controlId="c1"
                        controlCategory="Access Control"
                        columnIds={COLUMN_IDS}
                        renderEvidence={(n) => <span>{n} evidence</span>}
                        onTaskClick={onTaskClick}
                    />
                </tbody>
            </table>,
        );
        return { ...utils, onTaskClick };
    };

    it("renders task metadata in the matching columns: category / status / owner / evidence", async () => {
        const { container } = renderRows();
        await screen.findByText("Implement SSO enforcement");
        // Category inherited from the control (a tag).
        expect(screen.getByText("Access Control")).toBeInTheDocument();
        // Owner (task assignee) by name.
        expect(screen.getByText("Sam Ray")).toBeInTheDocument();
        // Evidence via the render-prop (matches the control row's cell).
        expect(screen.getByText("3 evidence")).toBeInTheDocument();
        // Status badge.
        expect(screen.getByText("OPEN")).toBeInTheDocument();
        // The row is a real <tr> with one <td> per column id (aligned).
        const row = container.querySelector('[data-task-quickview="t1"]');
        expect(row?.tagName).toBe("TR");
        expect(row?.className).toContain("cursor-pointer");
        expect(row?.querySelectorAll("td").length).toBe(COLUMN_IDS.length);
    });

    it("clicking anywhere on the task row fires onTaskClick (whole-row target)", async () => {
        const { onTaskClick } = renderRows();
        // Click the status badge area (NOT the title) — the whole row opens it.
        const badge = await screen.findByText("OPEN");
        fireEvent.click(badge);
        expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    });
});

describe("TaskQuickView", () => {
    it("renders the task + back/close/full-view, fires handlers", () => {
        const onBack = jest.fn();
        const onClose = jest.fn();
        render(<TaskQuickView task={TASK} onBack={onBack} onClose={onClose} />);
        expect(screen.getByTestId("task-quickview")).toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Task quick view" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Implement SSO enforcement")).toBeInTheDocument();
        expect(screen.getByText("Sam Ray")).toBeInTheDocument();
        expect(screen.getByTestId("task-quickview-fullview")).toHaveAttribute(
            "href",
            "/t/acme/tasks/t1",
        );
        fireEvent.click(screen.getByTestId("task-quickview-back"));
        expect(onBack).toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /close quick view/i }));
        expect(onClose).toHaveBeenCalled();
    });
});
