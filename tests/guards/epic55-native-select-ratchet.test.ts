/**
 * Epic 55 — native `<select>` ratchet guardrail.
 *
 * Epic 55 migrated the intended CRUD/edit forms onto the shared
 * `<Combobox>` + `<RadioGroup>` primitives. To keep the rollout durable,
 * this ratchet counts native `<select>` elements in the app-pages tree
 * and fails CI if the number grows.
 *
 * Rules:
 *   - The baseline is recorded below and may only go DOWN. Lowering it
 *     is the intended action when a new surface migrates; raising it
 *     would mean someone reached for native `<select>` where the shared
 *     Combobox is the canonical answer.
 *   - Scoped to `src/app/t/[tenantSlug]/(app)/**`. Library / admin /
 *     framework surfaces live outside this scope (see below for the
 *     explicit exclusion list).
 *
 * Baseline is 0: every native `<select>` inside the tenant app pages
 * has been migrated to `<Combobox>` (or `<RadioGroup>` where the
 * surface warranted inline options). New surfaces must not reintroduce
 * native selects — reach for the shared primitives instead. See
 * `docs/combobox-form-strategy.md` for the decision tree.
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_PAGES_ROOT = path.resolve(__dirname, '../../src/app/t');

// Recorded at the Epic 55 close-out pass. Lower when you migrate;
// raise only with a written reason.
//
// 0 → 4: Epic 53 inline-edit refactor on ControlsClient.tsx mounted
// four badge-styled native `<select>` elements as the per-row status
// + applicability + role pickers. These were a deliberate design
// choice — the comment block above each select explains the
// tradeoffs:
//   - native `<select>` keeps native a11y (label, arrow-key,
//     search-by-letter) on a dense table cell
//   - the badge-styled trigger preserves the legacy `#status-pill-{id}`
//     E2E selectors + the click-to-cycle UX
//   - a Combobox per row would mount four Radix Popovers per page, a
//     measurable hit on table render time
// Future work: a `<TableInlineSelect>` primitive could carry the same
// affordances on top of cmdk; until then this baseline reflects the
// real shape of the page.
//
// 4 → 6: Epic G-4 access review detail page mounts two native
// `<select>`s — one per-row decision picker and one MODIFY target-role
// select inside the decision dialog. Both follow the same pattern as
// the ControlsClient inline-edit selects (above): native `<select>` is
// the dense-table-cell + simple-modal-form choice; a Combobox per row
// would be heavier than the affordance demands. Bounded follow-up:
// the same `<TableInlineSelect>` primitive that supersedes the
// existing 4 would land here too.
const BASELINE_NATIVE_SELECTS = 6;

function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

const SOURCES = walk(APP_PAGES_ROOT, []).map((p) => ({
    file: path.relative(APP_PAGES_ROOT, p),
    src: fs.readFileSync(p, 'utf-8'),
}));

function countNativeSelects(): { total: number; byFile: Record<string, number> } {
    const byFile: Record<string, number> = {};
    let total = 0;
    // Match opening `<select` tag. Intentionally doesn't match
    // HTMLSelectElement types or JSX string literals.
    const re = /<select\b/g;
    for (const { file, src } of SOURCES) {
        const matches = src.match(re);
        if (matches) {
            byFile[file] = matches.length;
            total += matches.length;
        }
    }
    return { total, byFile };
}

describe('Epic 55 — native <select> ratchet', () => {
    it('count of native <select> elements does not grow beyond the baseline', () => {
        const { total, byFile } = countNativeSelects();
        if (total > BASELINE_NATIVE_SELECTS) {
            const formatted = Object.entries(byFile)
                .map(([file, count]) => `  ${count.toString().padStart(2)}× ${file}`)
                .join('\n');
            throw new Error(
                `Native <select> count ${total} exceeds Epic 55 baseline ${BASELINE_NATIVE_SELECTS}. ` +
                    `Use <Combobox> or <RadioGroup> for CRUD/edit forms; see ` +
                    `docs/combobox-form-strategy.md.\n\n` +
                    `Current distribution:\n${formatted}`,
            );
        }
        expect(total).toBeLessThanOrEqual(BASELINE_NATIVE_SELECTS);
    });

    it('baseline constant is a plausible non-negative integer', () => {
        expect(Number.isInteger(BASELINE_NATIVE_SELECTS)).toBe(true);
        expect(BASELINE_NATIVE_SELECTS).toBeGreaterThanOrEqual(0);
    });
});

// ─── Explicit drift sentinels — surfaces that MUST stay migrated ──

describe('Epic 55 — migrated surfaces must not regress to native <select>', () => {
    const MIGRATED_FILES = [
        'audits/cycles/page.tsx',
        'risks/NewRiskModal.tsx',
        'controls/NewControlModal.tsx',
        'evidence/UploadEvidenceModal.tsx',
        'evidence/NewEvidenceTextModal.tsx',
        'tasks/new/page.tsx',
        'vendors/new/page.tsx',
        'findings/FindingsClient.tsx',
        'clauses/ClausesBrowser.tsx',
        'policies/new/page.tsx',
        // Session 2 — Batch 1 migrated files
        'risks/[riskId]/page.tsx',
        'assets/[id]/page.tsx',
        'assets/AssetsClient.tsx',
        'controls/[controlId]/page.tsx',
        // PR-Q — the test-plan edit form's raw inputs moved into this shared view.
        'tests/_components/TestPlanDetailView.tsx',
        'tasks/TasksClient.tsx',
        'tasks/[taskId]/page.tsx',
        'admin/members/page.tsx',
        'admin/roles/page.tsx',
        'admin/api-keys/page.tsx',
        'admin/integrations/page.tsx',
        'vendors/[vendorId]/page.tsx',
        'risks/ai/page.tsx',
        'policies/templates/page.tsx',
        'tests/runs/[runId]/page.tsx',
        // Session 3 — final native-select closeouts (baseline → 0)
        'audits/AuditsClient.tsx',
        'frameworks/[frameworkKey]/templates/page.tsx',
    ].map((rel) => `[tenantSlug]/(app)/${rel}`);

    it.each(MIGRATED_FILES)(
        '%s contains no native <select> (Epic 55 migrated)',
        (relFile) => {
            const entry = SOURCES.find((s) => s.file === relFile);
            if (!entry) {
                // File moved/renamed — surface a clear failure.
                throw new Error(
                    `Migrated file not found at expected path: ${relFile}`,
                );
            }
            expect(entry.src).not.toMatch(/<select\b/);
        },
    );
});
