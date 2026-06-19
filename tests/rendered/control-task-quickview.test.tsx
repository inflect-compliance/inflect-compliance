/**
 * Controls side panel — inline task rows + the editable control panel.
 *
 * ControlTaskRows renders REAL <tr>/<td> rows aligned to the parent columns;
 * clicking a row fires onTaskClick (→ task panel). ControlEditPanel is the
 * EDITABLE control side panel: an edit form + an evidence-upload box (replacing
 * the old Intent field) + an Activity tab. (The old read-only ControlQuickView
 * / TaskQuickView were removed.)
 */
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/lib/tenant-context-provider", () => ({
    useTenantHref: () => (p: string) => `/t/acme${p}`,
}));

// UserCombobox (member lookup) uses react-query — wrap renders that include it.
const withQuery = (ui: React.ReactElement) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
    </QueryClientProvider>
);

import { ControlTaskRows } from "@/app/t/[tenantSlug]/(app)/controls/ControlTaskRows";
import { ControlEditPanel } from "@/app/t/[tenantSlug]/(app)/controls/ControlEditPanel";

const TASK = {
    id: "t1",
    key: "TSK-9",
    title: "Implement SSO enforcement",
    status: "OPEN",
    severity: "HIGH",
    assignee: { name: "Sam Ray" },
    _count: { evidence: 3 },
};

const CONTROL = {
    id: "c1",
    code: "A.1",
    name: "Access control policy",
    status: "IN_PROGRESS",
    category: "Access Control",
    owner: { id: "u1", name: "Dana Lee", email: "dana@x.io" },
};

describe("ControlTaskRows (aligned inline sub-rows → quick-view)", () => {
    beforeEach(() => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => [TASK],
        })) as unknown as typeof fetch;
    });

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
        expect(screen.getByText("Access Control")).toBeInTheDocument();
        expect(screen.getByText("Sam Ray")).toBeInTheDocument();
        expect(screen.getByText("3 evidence")).toBeInTheDocument();
        expect(screen.getByText("OPEN")).toBeInTheDocument();
        const row = container.querySelector('[data-task-quickview="t1"]');
        expect(row?.tagName).toBe("TR");
        expect(row?.className).toContain("cursor-pointer");
        expect(row?.querySelectorAll("td").length).toBe(COLUMN_IDS.length);
    });

    it("clicking anywhere on the task row fires onTaskClick (whole-row target)", async () => {
        const { onTaskClick } = renderRows();
        const badge = await screen.findByText("OPEN");
        fireEvent.click(badge);
        expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    });
});

describe("ControlEditPanel (editable control side panel)", () => {
    beforeEach(() => {
        // Broad mock: evidence list + activity feed + member lookups → empty.
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => [],
        })) as unknown as typeof fetch;
    });

    const renderPanel = () =>
        render(
            withQuery(
                <ControlEditPanel
                    tenantSlug="acme"
                    control={CONTROL}
                    canWrite
                    onClose={jest.fn()}
                    onSaved={jest.fn()}
                />,
            ),
        );

    it("is an edit form with an evidence-upload box and NO Intent field", () => {
        renderPanel();
        expect(screen.getByTestId("control-edit-panel")).toBeInTheDocument();
        expect(screen.getByTestId("control-edit-form")).toBeInTheDocument();
        expect(screen.getByTestId("control-edit-save")).toBeInTheDocument();
        expect(screen.getByTestId("control-evidence-box")).toBeInTheDocument();
        // The old Intent field is gone, replaced by evidence upload.
        expect(screen.queryByText("Intent")).not.toBeInTheDocument();
        // Seeded from the row.
        expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe(
            "Access control policy",
        );
    });

    it("has an Activity tab that shows the feed", async () => {
        renderPanel();
        fireEvent.click(screen.getByText("Activity"));
        // Empty feed (mock returns []).
        expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
        // The edit form is hidden while on the Activity tab.
        expect(screen.queryByTestId("control-edit-form")).not.toBeInTheDocument();
    });
});
