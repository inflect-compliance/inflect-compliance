/**
 * Roadmap-9 PR-4 — DataTable unification (Controls as the canonical reference).
 *
 * User directive locked 2026-05-11: the Controls page DataTable
 * (`src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx`) is
 * the reference shape every other table unifies around. Four rules
 * follow:
 *
 *   1. **Selection circle.** Row-select Checkbox renders as a
 *      circle (`rounded-full`), not the prior `rounded-md`. Locks
 *      both the per-row select cell (table.tsx) AND the select-all
 *      cell (selection-toolbar.tsx) AND the in-toolbar live mirror.
 *
 *   2. **Row hover.** Clickable rows get the canonical
 *      `group-hover/row:bg-bg-muted transition-colors duration-75`
 *      treatment from the DataTable primitive. The primitive's
 *      `clickable && ...` ternary handles this for every consumer
 *      that wires `onRowClick`.
 *
 *   3. **First column = Code.** Where the entity has a code/
 *      identifier (controls, risks, frameworks, policies, audits,
 *      assets), the first column should be `id: 'code'`. Migration
 *      target — coverage ratchet registers candidate tables.
 *
 *   4. **Stable row IDs.** `getRowId: (row) => row.id` set on every
 *      table to anchor row selection across data refreshes.
 *
 * This ratchet locks the geometry contracts at the primitive level
 * (circle-select shape, hover recipe). Consumer migration for "first
 * column = Code" is registered for follow-up work.
 *
 * Supersedes the R9-PR4 "selected-state vocabulary" framing per the
 * user-locked memory entry.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("DataTable unification — Controls as the canonical shape", () => {
    it("row-select Checkbox in table.tsx is rounded-full (circular select)", () => {
        const src = fs.readFileSync(
            path.join(ROOT, "src/components/ui/table/table.tsx"),
            "utf8",
        );
        // The select-cell Checkbox renders TWICE in this file (header
        // select-all + body per-row). Both must be rounded-full.
        const matches = src.match(
            /size-4\s+rounded-full\s+data-\[state=checked\]:bg-\[var\(--brand-emphasis\)\]/g,
        );
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(2);
        // And the legacy rounded-md shape is gone.
        expect(src).not.toMatch(
            /size-4\s+rounded\s+data-\[state=checked\]/,
        );
    });

    it("select-all Checkbox in selection-toolbar.tsx is rounded-full", () => {
        const src = fs.readFileSync(
            path.join(ROOT, "src/components/ui/table/selection-toolbar.tsx"),
            "utf8",
        );
        expect(src).toMatch(
            /size-4\s+rounded-full\s+data-\[state=checked\]:bg-\[var\(--brand-emphasis\)\]/,
        );
        expect(src).not.toMatch(
            /size-4\s+rounded\s+data-\[state=checked\]/,
        );
    });

    it("primitive hover recipe is `group-hover/row:bg-bg-muted` on clickable rows", () => {
        // The primitive ternary `clickable && "group-hover/row:..."`
        // is what gives every <DataTable onRowClick=> consumer the
        // canonical hover treatment. Locking the literal here prevents
        // a future "simplify" PR from stripping the transition or
        // changing the bg recipe.
        const src = fs.readFileSync(
            path.join(ROOT, "src/components/ui/table/table.tsx"),
            "utf8",
        );
        expect(src).toMatch(
            /clickable\s*&&\s*"group-hover\/row:bg-bg-muted\s+transition-colors\s+duration-75"/,
        );
    });

    it("Controls table — the canonical reference — sets the four locked traits", () => {
        const src = fs.readFileSync(
            path.join(
                ROOT,
                "src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx",
            ),
            "utf8",
        );
        // 1. First column is `id: 'code'`.
        expect(src).toMatch(/id:\s*['"]code['"]/);
        // 2. getRowId is set.
        expect(src).toMatch(/getRowId:\s*\(c\)\s*=>\s*c\.id/);
        // 3. onRowClick wires the canonical primitive hover.
        expect(src).toMatch(/onRowClick:/);
        // 4. The hover className is preserved on the table chrome.
        expect(src).toMatch(/hover:bg-bg-muted/);
    });
});

// ── Code-column adoption registry ────────────────────────────────
//
// Tables where the entity carries a code/identifier should open with
// a `code` column. Adoption tracker — flip the `adopted` flag when
// each consumer's first column is migrated. Same registry shape as
// `pageheader-adoption.test.ts` and the EntityDetailLayout family.

interface CodeColumnEntry {
    file: string;
    /** Whether the first non-utility column is `id: 'code'`. */
    adopted: boolean;
    /** Why this table belongs in the registry. */
    note: string;
}

const CODE_COLUMN_TABLES: CodeColumnEntry[] = [
    {
        file: "src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx",
        adopted: true,
        note: "Controls — the canonical reference. First column is `id: 'code'` accessing `c.code || c.annexId || ''`.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx",
        adopted: false,
        note: "Risks list — entity carries a code; first column migration pending.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/frameworks/FrameworksClient.tsx",
        adopted: false,
        note: "Frameworks catalogue — entity carries a code; first column migration pending.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/AuditsClient.tsx",
        adopted: false,
        note: "Audits master/detail — audit identifiers exist; first column migration pending.",
    },
];

describe("DataTable code-column registry", () => {
    it("every registered table exists in the codebase", () => {
        for (const entry of CODE_COLUMN_TABLES) {
            const full = path.join(ROOT, entry.file);
            expect(fs.existsSync(full)).toBe(true);
        }
    });

    it("every page marked `adopted: true` opens with `id: 'code'`", () => {
        for (const entry of CODE_COLUMN_TABLES) {
            if (!entry.adopted) continue;
            const src = fs.readFileSync(
                path.join(ROOT, entry.file),
                "utf8",
            );
            expect(src).toMatch(/id:\s*['"]code['"]/);
        }
    });

    it("every entry carries a structural note", () => {
        for (const entry of CODE_COLUMN_TABLES) {
            expect(entry.note.length).toBeGreaterThan(25);
        }
    });
});
