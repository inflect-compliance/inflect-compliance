/**
 * Mobile PR-2 — `<DataTable>` swaps the wide table for a stacked CARD list
 * below `md` (a phone) so nothing overflows / truncates. The swap is gated by
 * `useIsBelowMd`, which is `false` under jsdom — so the DESKTOP table is the
 * default in tests (matching every existing table/entity-page test). Forcing
 * the hook to `true` exercises the card branch.
 */
import { render, screen, within } from "@testing-library/react";
import * as React from "react";

let mockBelowMd = false;
jest.mock("@/components/ui/table/use-is-below-md", () => ({
    useIsBelowMd: () => mockBelowMd,
}));

import { DataTable, createColumns } from "@/components/ui/table";

interface Row {
    id: string;
    name: string;
    status: string;
}

const LONG_NAME =
    "Quarterly Access Recertification for the Production Data Warehouse and Downstream Analytics Pipeline";

const columns = createColumns<Row>([
    { id: "name", header: "Name", accessorKey: "name" },
    { id: "status", header: "Status", accessorKey: "status" },
]);

const data: Row[] = [
    { id: "r1", name: LONG_NAME, status: "OPEN" },
    { id: "r2", name: "Short one", status: "CLOSED" },
];

beforeEach(() => {
    mockBelowMd = false;
});

describe("DataTable responsive rendering", () => {
    it("desktop (default): renders the table, not the card list", () => {
        render(<DataTable<Row> data={data} columns={columns} getRowId={(r) => r.id} />);
        expect(screen.queryByTestId("data-table-cards")).toBeNull();
        expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("phone: renders a card list (one card per row), not a table", () => {
        mockBelowMd = true;
        render(<DataTable<Row> data={data} columns={columns} getRowId={(r) => r.id} />);
        const cards = screen.getByTestId("data-table-cards");
        expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("phone: each column header is a field label and the full value shows", () => {
        mockBelowMd = true;
        render(<DataTable<Row> data={data} columns={columns} getRowId={(r) => r.id} />);
        const cards = screen.getByTestId("data-table-cards");
        expect(within(cards).getAllByText("Name").length).toBe(2);
        expect(within(cards).getAllByText("Status").length).toBe(2);
        // Long value renders verbatim — never truncated to fit the card.
        expect(within(cards).getByText(LONG_NAME).textContent).toBe(LONG_NAME);
    });

    it("phone + empty: keeps the table's own empty chrome (no card list)", () => {
        mockBelowMd = true;
        render(<DataTable<Row> data={[]} columns={columns} getRowId={(r) => r.id} />);
        expect(screen.queryByTestId("data-table-cards")).toBeNull();
    });
});
