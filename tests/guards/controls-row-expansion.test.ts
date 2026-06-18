/**
 * Controls PR-1 — inline task-row expansion ratchet.
 *
 * Locks: the DataTable primitive supports expandable rows (tanstack expanded
 * model + a renderExpandedRow sub-row slot), and the Controls table opts in to
 * render its linked tasks inline under each control. Default-off contract: the
 * chevron/sub-row only render when a consumer passes `renderExpandedRow`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Controls PR-1 — row expansion", () => {
    it("DataTable primitive wires the tanstack expanded model + sub-row slot", () => {
        const table = read("src/components/ui/table/table.tsx");
        expect(table).toMatch(/getExpandedRowModel\(\)/);
        expect(table).toMatch(/getRowCanExpand/);
        expect(table).toMatch(/renderExpandedRow && row\.getIsExpanded\(\)/);
        expect(table).toMatch(/data-expanded-subrow/);
    });

    it("the expand chevron only renders when the consumer opts in", () => {
        // `!!renderExpandedRow && … && row.getCanExpand()` — no opt-in → no chevron.
        const table = read("src/components/ui/table/table.tsx");
        expect(table).toMatch(/!!renderExpandedRow &&[\s\S]*row\.getCanExpand\(\)/);
    });

    it("Controls table opts in: getRowCanExpand + renderExpandedRow", () => {
        const src = read("src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx");
        expect(src).toMatch(/getRowCanExpand: getControlCanExpand/);
        expect(src).toMatch(/renderExpandedRow: renderControlTaskRows/);
        expect(src).toMatch(/<ControlTaskRows/);
    });

    it("expanded task rows lazy-fetch the control's linked tasks", () => {
        const src = read("src/app/t/[tenantSlug]/(app)/controls/ControlTaskRows.tsx");
        expect(src).toMatch(/linkedEntityType=CONTROL&linkedEntityId=/);
    });
});
