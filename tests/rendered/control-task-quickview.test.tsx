/**
 * Controls PR-2 — control + task quick-view panels.
 *
 * ControlQuickView renders a condensed control summary (from row data, no
 * fetch) + a lazy task list; clicking a task fires onTaskClick. TaskQuickView
 * renders from the passed task object with back + close + full-view affordances.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";

// Tenant href hook → identity-ish so links render.
jest.mock("@/lib/tenant-context-provider", () => ({
    useTenantHref: () => (p: string) => `/t/acme${p}`,
}));

import { ControlQuickView } from "@/app/t/[tenantSlug]/(app)/controls/ControlQuickView";
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
};

describe("ControlQuickView", () => {
    beforeEach(() => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => [TASK],
        })) as unknown as typeof fetch;
    });

    it("renders the control summary + full-view link", () => {
        render(
            <ControlQuickView
                tenantSlug="acme"
                control={CONTROL}
                onClose={jest.fn()}
                onTaskClick={jest.fn()}
            />,
        );
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

    it("close button fires onClose", () => {
        const onClose = jest.fn();
        render(
            <ControlQuickView
                tenantSlug="acme"
                control={CONTROL}
                onClose={onClose}
                onTaskClick={jest.fn()}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /close quick view/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it("clicking a lazy-loaded task fires onTaskClick with the task", async () => {
        const onTaskClick = jest.fn();
        render(
            <ControlQuickView
                tenantSlug="acme"
                control={CONTROL}
                onClose={jest.fn()}
                onTaskClick={onTaskClick}
            />,
        );
        const taskBtn = await screen.findByText("Implement SSO enforcement");
        fireEvent.click(taskBtn);
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
