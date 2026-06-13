/**
 * RQ3-OB-C — Tab deep-link discipline.
 *
 * Regression classes guarded:
 *
 *   - the staleness widget regressing to a bare /risks/:id link
 *     (the user lands on Overview and has to navigate to Assessment
 *     to close the rot signal — wasted clicks);
 *   - the coherence widget regressing similarly (a qual↔quant
 *     contradiction is resolved in the Assessment tab);
 *   - the overdue-reviews list regressing (the entire point of the
 *     row is the review, which lives in Assessment);
 *   - the board page's top-contributors list regressing (the exec
 *     wants the headline view, which is the Assessment tab).
 *
 * The RQ3-7 work that established this pattern (KRI deep-link +
 * detail-page ?tab= honouring) is locked by its own ratchet;
 * THIS ratchet keeps the propagation honest.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const dashboard = read('src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx');
const board = read('src/app/t/[tenantSlug]/(app)/risks/board/page.tsx');

describe('RQ3-OB-C — risk widgets deep-link to ?tab=assessment', () => {
    test('the staleness widget row links to the assessment tab', () => {
        // The row is keyed `risk-stale-row-` and rendered inside the
        // `staleness.staleRisks.slice(0, 10).map(...)` block.
        const block = dashboard.slice(
            dashboard.indexOf('risk-stale-row-') - 800,
            dashboard.indexOf('risk-stale-row-') + 400,
        );
        expect(block).toMatch(/href=\{href\(`\/risks\/\$\{r\.riskId\}\?tab=assessment`\)\}/);
    });

    test('the coherence widget row links to the assessment tab', () => {
        const idx = dashboard.indexOf('risk-coherence-row-');
        expect(idx).toBeGreaterThan(0);
        const block = dashboard.slice(idx - 800, idx + 400);
        expect(block).toMatch(/href=\{href\(`\/risks\/\$\{f\.riskId\}\?tab=assessment`\)\}/);
    });

    test('the overdue-reviews list links to the assessment tab', () => {
        // The overdueRisks.map row uses `r.id` and lives near the
        // bottom of the file. Look for the assessment-tab href in
        // the overdueRisks region.
        const idx = dashboard.indexOf('overdueRisks.map');
        expect(idx).toBeGreaterThan(0);
        const block = dashboard.slice(idx, idx + 600);
        expect(block).toMatch(/href=\{href\(`\/risks\/\$\{r\.id\}\?tab=assessment`\)\}/);
    });

    test('the board top-contributors row links to the assessment tab', () => {
        expect(board).toMatch(/href=\{href\(`\/risks\/\$\{row\.id\}\?tab=assessment`\)\}/);
    });
});
