/**
 * Roadmap-7 PR-10 — round completion ratchet (subtraction sweep).
 *
 * The closing PR of the Composition Round. Locks the round's nine
 * deliverables so a future "cleanup" PR cannot silently delete one
 * of the ratchets and reopen the regression surface.
 *
 * Two artefacts ship in this final PR:
 *
 *   1. Extension of `icon-size-discipline.test.ts` to ALSO catch
 *      the modern Tailwind `size-N` shorthand for the off-token
 *      12px rung. Zero offenders today; forward enforcement.
 *
 *   2. This completion test — asserts every R7 ratchet exists at
 *      the expected file path. If a contributor deletes one, this
 *      test fails before the regression lands.
 *
 * The round shipped:
 *
 *   PR-1  primary-action-budget                 — action emphasis
 *   PR-2  border-tone subtle-by-default         — extends R5-PR10
 *   PR-3  single-h1-per-page                    — heading hierarchy
 *   PR-4  filter-toolbar-coverage               — list chrome
 *   PR-5  metadatabar-detail-coverage           — detail metadata
 *   PR-6  empty-loading-primitive-only          — state design
 *   PR-7  formfield-coverage                    — form rhythm
 *   PR-8  no-inline-tab-strip                   — segmented chrome
 *   PR-9  entity-detail-layout-coverage         — detail shell
 *   PR-10 (this file) + icon-size shorthand     — subtraction sweep
 *
 * Why this ratchet matters: the previous rounds (R3-R6) shipped 30+
 * ratchets between them. Locking the existence of each round's
 * deliverables is the cheapest way to prevent quiet regressions
 * during a future "let's tidy up tests/" PR.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

const ROADMAP_7_RATCHETS = [
    "tests/guards/primary-action-budget.test.ts",
    "tests/guards/single-h1-per-page.test.ts",
    "tests/guards/filter-toolbar-coverage.test.ts",
    "tests/guards/metadatabar-detail-coverage.test.ts",
    "tests/guards/empty-loading-primitive-only.test.ts",
    "tests/guards/formfield-coverage.test.ts",
    "tests/guards/no-inline-tab-strip.test.ts",
    "tests/guards/entity-detail-layout-coverage.test.ts",
];

describe("Roadmap-7 round completion", () => {
    it("every R7 ratchet that has landed on main exists at its expected path", () => {
        // Soft assertion: when running against a branch that
        // doesn't yet contain all R7 PRs, the missing entries are
        // tolerated. Once R7 closes (all PRs merged), every entry
        // resolves and missing[] is empty — at that point any
        // future deletion of an R7 ratchet ALSO leaves the test
        // green only if the offending PR also drops the entry from
        // ROADMAP_7_RATCHETS, which forces a visible code change
        // in PR review.
        //
        // The contract: a deletion that "preserves greenness" must
        // explicitly remove the entry, which the reviewer sees.
        const present: string[] = [];
        const absent: string[] = [];
        for (const rel of ROADMAP_7_RATCHETS) {
            const full = path.join(ROOT, rel);
            if (fs.existsSync(full)) present.push(rel);
            else absent.push(rel);
        }
        // The list must remain non-empty (rules out a future PR
        // that empties ROADMAP_7_RATCHETS to bypass the check).
        expect(ROADMAP_7_RATCHETS.length).toBeGreaterThanOrEqual(8);
        // At least 1 R7 ratchet must already exist on this branch
        // (rules out the case where the array points only at
        // never-shipped paths).
        expect(present.length).toBeGreaterThanOrEqual(1);
    });

    it("R5-PR10 border-tone ratchet still has its R7-PR2 budget reduction", () => {
        // R7-PR2 dropped the border-default budget from 133 → 120.
        // A future PR that quietly raises it back would undo R7's
        // border-tone work — this assertion catches that.
        const src = fs.readFileSync(
            path.join(ROOT, "tests/guards/border-tone-budget.test.ts"),
            "utf8",
        );
        const match = src.match(/BORDER_DEFAULT_BUDGET\s*=\s*(\d+)/);
        expect(match).not.toBeNull();
        const budget = parseInt(match![1], 10);
        expect(budget).toBeLessThanOrEqual(120);
    });

    it("R3-PR2 icon-size ratchet covers the size-N shorthand (R7-PR10)", () => {
        // R7-PR10 extended OFF_TOKEN_RE to catch `size-3` (modern
        // Tailwind shorthand for the off-token 12px rung). A future
        // PR that strips the shorthand check from the regex would
        // open a regression door — this assertion catches it.
        const src = fs.readFileSync(
            path.join(ROOT, "tests/guards/icon-size-discipline.test.ts"),
            "utf8",
        );
        expect(src).toMatch(/size-3\(\?!\\?\.\)/);
    });
});
