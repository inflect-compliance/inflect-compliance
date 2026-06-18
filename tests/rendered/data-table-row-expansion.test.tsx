/**
 * Controls PR-1 — DataTable expandable rows.
 *
 * A row whose `getRowCanExpand` returns true shows a leading chevron; toggling
 * it renders `renderExpandedRow(row)` as a full-width sub-row. Default off:
 * without `renderExpandedRow` no chevron renders and behaviour is unchanged
 * (so every existing table is unaffected).
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import * as React from "react";

import { DataTable, createColumns } from "@/components/ui/table";

interface Row {
    id: string;
    name: string;
}
const columns = createColumns<Row>([
    { id: "name", header: "Name", accessorKey: "name" },
]);
const data: Row[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Bravo" },
];

describe("DataTable expandable rows", () => {
    it("renders no chevron when renderExpandedRow is absent (default off)", () => {
        render(<DataTable<Row> data={data} columns={columns} getRowId={(r) => r.id} />);
        expect(screen.queryByRole("button", { name: /expand row/i })).toBeNull();
    });

    it("shows a chevron per expandable row and reveals the sub-row on click", () => {
        render(
            <DataTable<Row>
                data={data}
                columns={columns}
                getRowId={(r) => r.id}
                getRowCanExpand={() => true}
                renderExpandedRow={(row) => (
                    <div data-testid={`exp-${row.original.id}`}>
                        tasks for {row.original.name}
                    </div>
                )}
            />,
        );
        const chevrons = screen.getAllByRole("button", { name: /expand row/i });
        expect(chevrons).toHaveLength(2);
        // Collapsed initially.
        expect(screen.queryByTestId("exp-a")).toBeNull();
        // Expand row A.
        fireEvent.click(chevrons[0]);
        expect(screen.getByTestId("exp-a").textContent).toBe("tasks for Alpha");
        // The sub-row spans the table and carries the marker.
        expect(
            document.querySelector('[data-expanded-subrow="a"]'),
        ).toBeInTheDocument();
        // Row B stays collapsed.
        expect(screen.queryByTestId("exp-b")).toBeNull();
    });

    it("only flags rows allowed by getRowCanExpand", () => {
        render(
            <DataTable<Row>
                data={data}
                columns={columns}
                getRowId={(r) => r.id}
                getRowCanExpand={(row) => row.original.id === "a"}
                renderExpandedRow={(row) => <div>{row.original.name}</div>}
            />,
        );
        expect(screen.getAllByRole("button", { name: /expand row/i })).toHaveLength(1);
    });
});
