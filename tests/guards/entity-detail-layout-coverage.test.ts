/**
 * Roadmap-7 PR-9 — EntityDetailLayout coverage ratchet.
 *
 * `<EntityDetailLayout>` is the shared shell every entity-detail
 * page should mount: it owns the back-link, title, metadata slot,
 * actions cluster, tab bar, and the loading / error / empty
 * branches in one consistent shape. It pairs with `<MetadataBar>`
 * (R7-PR5 registry) — the metadata strip plugs into the shell's
 * `meta` slot.
 *
 * 11 files mount `<EntityDetailLayout>` today; 7 known detail pages
 * still hand-roll the title + breadcrumbs + actions cluster. This
 * ratchet documents the adoption gap with per-page notes and locks
 * the migration as a one-way march.
 *
 * Sister registry to `metadatabar-detail-coverage.test.ts`. Each
 * file flagged here also has a corresponding R7-PR5 entry; in most
 * cases the EntityDetailLayout migration unblocks the MetadataBar
 * migration (the layout's `meta` slot is the cleanest entry point).
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

interface DetailPageEntry {
    file: string;
    /** Whether this page mounts <EntityDetailLayout>. */
    adopted: boolean;
    note: string;
}

/**
 * Detail pages with explicit adoption status. The registry pairs
 * with the MetadataBar coverage list — entries here that are
 * `adopted: true` are typically also the easiest MetadataBar
 * migration targets, since the layout's `meta` slot is plug-and-
 * play with `<MetadataBar>`.
 */
const DETAIL_PAGES: DetailPageEntry[] = [
    // ── Adopted ──
    {
        file: "src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx",
        adopted: true,
        note: "First detail page on EntityDetailLayout — the proof-of-pattern reference.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx",
        adopted: true,
        note: "Heavy detail page with multiple tabs + traceability panel; runs through the shell cleanly.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx",
        adopted: true,
        note: "Vendor detail with sub-tabs (Overview, Documents, Risks, Assessments).",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx",
        adopted: true,
        note: "Policy detail with versioning + acknowledgment tabs.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/page.tsx",
        adopted: true,
        note: "Audit cycle detail with readiness + checklist tabs.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/tasks/[taskId]/page.tsx",
        adopted: true,
        note: "Task detail with Links / Comments / Activity tabs.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx",
        adopted: true,
        note: "Asset detail with classification + lifecycle metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/page.tsx",
        adopted: true,
        note: "Audit pack detail with grouped item rendering.",
    },

    // ── Pending migration ──
    {
        file: "src/app/t/[tenantSlug]/(app)/issues/[issueId]/page.tsx",
        adopted: false,
        note: "Issue detail with hand-rolled breadcrumb + heading + actions cluster. Migration pending — clean candidate (single tab, clear metadata).",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/access-reviews/[reviewId]/page.tsx",
        adopted: false,
        note: "Access review detail. Pending migration — needs careful handling of the review's run-time state UI.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/assessment/[assessmentId]/page.tsx",
        adopted: false,
        note: "Nested vendor assessment review detail. Pending migration — sub-route of vendor detail; needs breadcrumb stacking.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/controls/[controlId]/tests/[planId]/page.tsx",
        adopted: false,
        note: "Nested control test plan detail. Pending migration — sub-route of control detail; needs breadcrumb stacking.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/admin/vendor-assessment-reviews/[assessmentId]/page.tsx",
        adopted: false,
        note: "Admin-side vendor assessment review. Pending migration — admin-area sub-route.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/admin/vendor-templates/[templateId]/page.tsx",
        adopted: false,
        note: "Admin-side vendor template builder. Pending migration — wizard-shaped page; may need <EntityDetailLayout> adaptation rather than direct adoption.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/readiness/page.tsx",
        adopted: false,
        note: "Audit cycle readiness sub-page. Pending migration — sub-route of audit cycle; needs breadcrumb stacking.",
    },
];

describe("EntityDetailLayout coverage", () => {
    it("every registered detail page exists in the codebase", () => {
        const missing: string[] = [];
        for (const entry of DETAIL_PAGES) {
            const full = path.join(ROOT, entry.file);
            if (!fs.existsSync(full)) {
                missing.push(entry.file);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                `DETAIL_PAGES references files that no longer exist:\n${missing.map((m) => `  ${m}`).join("\n")}`,
            );
        }
        expect(missing).toHaveLength(0);
    });

    it("every page marked `adopted: true` actually mounts <EntityDetailLayout>", () => {
        const violations: string[] = [];
        for (const entry of DETAIL_PAGES) {
            if (!entry.adopted) continue;
            const full = path.join(ROOT, entry.file);
            const content = fs.readFileSync(full, "utf8");
            if (!/<EntityDetailLayout\b/.test(content)) {
                violations.push(entry.file);
            }
        }
        if (violations.length > 0) {
            throw new Error(
                `Pages marked \`adopted: true\` but missing <EntityDetailLayout>:\n${violations.map((v) => `  ${v}`).join("\n")}\n\nEither restore the <EntityDetailLayout> mount, or — if the migration was deliberately reverted — flip the registry entry back to \`adopted: false\` with a comment explaining why.`,
            );
        }
        expect(violations).toHaveLength(0);
    });

    it("every page marked `adopted: false` actually does NOT mount <EntityDetailLayout> (otherwise flip the flag)", () => {
        const violations: string[] = [];
        for (const entry of DETAIL_PAGES) {
            if (entry.adopted) continue;
            const full = path.join(ROOT, entry.file);
            const content = fs.readFileSync(full, "utf8");
            if (/<EntityDetailLayout\b/.test(content)) {
                violations.push(entry.file);
            }
        }
        if (violations.length > 0) {
            throw new Error(
                `Pages marked \`adopted: false\` but ALREADY mount <EntityDetailLayout>:\n${violations.map((v) => `  ${v}`).join("\n")}\n\nFlip the registry entry to \`adopted: true\` and update the note. The migration completed; the registry should reflect it.`,
            );
        }
        expect(violations).toHaveLength(0);
    });

    it("every entry has a non-trivial note (no anonymous registry rows)", () => {
        for (const entry of DETAIL_PAGES) {
            expect(entry.note.length).toBeGreaterThan(40);
        }
    });
});
