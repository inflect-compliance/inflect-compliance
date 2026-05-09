/**
 * v2-PR-12 — List header trio + DataTable row hover ratchet.
 *
 * Two contracts in one PR (both list-page surface concerns):
 *
 *   1. EntityListPage exposes the eyebrow + title + description
 *      "trio" via its header config. The PageHeader primitive
 *      (v2-PR-5) already supports the slot; this PR threads it
 *      through the list-page shell so consumers can adopt the
 *      v2 polish copy convention (uppercase resource name above
 *      the title, narrative description below).
 *
 *   2. DataTable rows with `onRowClick` paint a brand-coloured
 *      left-border affordance on hover so clickable rows hint at
 *      navigation without a column header saying "Open". (`<tr>`
 *      elements don't render direct CSS borders — the inset
 *      box-shadow is the canonical workaround. The motion-language
 *      ratchet has table.tsx exempted with a written reason.)
 *
 * Pairs with:
 *   - src/components/layout/EntityListPage.tsx (header trio props)
 *   - src/components/layout/PageHeader.tsx (the eyebrow slot)
 *   - src/components/ui/table/table.tsx (the row hover affordance)
 *   - tests/guards/motion-language-discipline.test.ts (the
 *     box-shadow exemption for table.tsx)
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("v2-PR-12 EntityListPage header trio", () => {
    const src = fs.readFileSync(
        path.join(ROOT, "src/components/layout/EntityListPage.tsx"),
        "utf8",
    );

    it("EntityListPageHeader declares both `eyebrow` and `description` slots", () => {
        // Both are optional (`?:`); `title` stays required.
        expect(src).toMatch(/\beyebrow\?:/);
        expect(src).toMatch(/\bdescription\?:/);
    });

    it("threads `eyebrow` into the PageHeader render", () => {
        expect(src).toMatch(/eyebrow=\{header\.eyebrow\}/);
    });

    it("`description` wins over `count` when both are passed", () => {
        // Migration-friendly fallback: pages that haven't migrated
        // to the new vocabulary keep their existing `count` line;
        // pages that have, drop into the new slot cleanly.
        expect(src).toMatch(/header\.description\s*\?\?\s*header\.count/);
    });
});

describe("v2-PR-12 DataTable row hover affordance", () => {
    const src = fs.readFileSync(
        path.join(ROOT, "src/components/ui/table/table.tsx"),
        "utf8",
    );

    it("renders a brand-coloured left-border on hover for clickable rows", () => {
        // Inset box-shadow is the canonical "left-border on a <tr>"
        // workaround. The brand-default token is the colour.
        expect(src).toMatch(
            /hover:shadow-\[inset_2px_0_0_0_var\(--brand-default\)\]/,
        );
    });

    it("uses the v2-PR-4 motion language (transition-colors duration-150)", () => {
        // The hover affordance sits on the same motion as every
        // other clickable surface — bg/border colour transitions
        // only, no transform. Find the line in the row className
        // string that wires the hover affordance.
        const rowBlock = src.match(
            /onRowClick\s*&&\s*"[^"]*hover:shadow-\[inset_2px_0_0_0_var\(--brand-default\)\][^"]*"/,
        );
        expect(rowBlock).not.toBeNull();
        const rowClass = rowBlock![0];
        expect(rowClass).toMatch(/transition-colors/);
        expect(rowClass).toMatch(/duration-150/);
        expect(rowClass).toMatch(/ease-out/);
    });

    it("hover affordance is gated on `onRowClick` (no affordance on read-only rows)", () => {
        // Read-only rows must not signal "click me". The inset
        // border ONLY applies when onRowClick is supplied.
        expect(src).toMatch(
            /onRowClick\s*&&\s*"[^"]*hover:shadow-\[inset_2px_0_0_0_var\(--brand-default\)\]/,
        );
    });
});
