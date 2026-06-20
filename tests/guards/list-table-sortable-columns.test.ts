/**
 * List-table sortable-column coverage (2026-06-20).
 *
 * Every standard entity list table must offer per-column sort — the
 * ascending/descending arrow affordance on each sortable header. The
 * shared `<DataTable>` renders the arrows when the page passes
 * `sortableColumns` + the `sortBy` / `sortOrder` / `onSortChange`
 * controlled-sort surface; a page that omits them silently loses the
 * affordance.
 *
 * controls / risks / tasks / evidence had it; assets / tests /
 * policies / vendors were added in the same pass. This ratchet locks
 * all eight so a refactor can't quietly drop the arrows from one.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const APP = 'src/app/t/[tenantSlug]/(app)';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGES: Array<[string, string]> = [
    ['Controls', `${APP}/controls/ControlsClient.tsx`],
    ['Risks', `${APP}/risks/RisksClient.tsx`],
    ['Tasks', `${APP}/tasks/TasksClient.tsx`],
    ['Evidence', `${APP}/evidence/EvidenceClient.tsx`],
    ['Assets', `${APP}/assets/AssetsClient.tsx`],
    ['Tests', `${APP}/tests/page.tsx`],
    ['Policies', `${APP}/policies/PoliciesClient.tsx`],
    ['Vendors', `${APP}/vendors/VendorsClient.tsx`],
];

describe('List-table sortable-column coverage', () => {
    for (const [name, file] of PAGES) {
        describe(name, () => {
            const src = read(file);

            it('wires sortableColumns into its table', () => {
                expect(src).toMatch(/sortableColumns/);
            });

            it('threads the controlled sort surface (sortBy + sortOrder + onSortChange)', () => {
                expect(src).toMatch(/sortBy/);
                expect(src).toMatch(/sortOrder/);
                expect(src).toMatch(/onSortChange/);
            });
        });
    }
});
