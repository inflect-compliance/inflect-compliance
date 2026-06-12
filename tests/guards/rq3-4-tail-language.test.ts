/**
 * RQ3-4 — "tail-aware language, everywhere" ratchet.
 *
 * Regression classes guarded:
 *
 *   - a per-risk ALE surface dropping back to a bare mean where tail
 *     data exists: every named surface (list chip, detail meta strip,
 *     explainer quant line, coherence rows, top-10, PDF/PPTX rows)
 *     must render through the ONE formatter
 *     (`formatTailAwareAle` in `src/lib/tail-language.ts`);
 *   - the formatter losing its registers (the "bad year …(P90)"
 *     second register, or the honest "(mean — run a simulation for
 *     tails)" suffix);
 *   - the tail-percentiles endpoint unwiring from the RQ3-1 cache;
 *   - the CSV data column silently duplicating the mean into the
 *     bad-year cell.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const lib = read('src/lib/tail-language.ts');
const risksClient = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');
const detailPage = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx');
const dashboard = read('src/app/t/[tenantSlug]/(app)/risks/dashboard/page.tsx');
const explainer = read('src/app-layer/usecases/risk-score-explanation.ts');
const renderer = read('src/app-layer/reports/risk-report-render.ts');
const reportUsecase = read('src/app-layer/usecases/risk-report.ts');
const route = read('src/app/api/t/[tenantSlug]/risks/tail-percentiles/route.ts');

describe('RQ3-4 — one formatter, two registers', () => {
    test('the formatter carries both registers + the honest mean suffix', () => {
        expect(lib).toMatch(/export function formatTailAwareAle/);
        expect(lib).toMatch(/bad year \$\{money\(aleP90\)\} \(P90\)/);
        expect(lib).toMatch(/bad yr /);
        expect(lib).toMatch(/\(mean — run a simulation for tails\)/);
        // P90 at/below the mean is not tail data.
        expect(lib).toMatch(/aleP90 > aleMean/);
    });

    test('the cache endpoint serves the RQ3-1 spine', () => {
        expect(route).toMatch(/getPerRiskPercentiles/);
        expect(route).toMatch(/export const GET = withApiErrorHandling/);
    });
});

describe('RQ3-4 — zero surfaces render a bare mean where tails exist', () => {
    test('risk register chip', () => {
        expect(risksClient).toMatch(/formatTailAwareAle\(/);
        expect(risksClient).toMatch(/\/risks\/tail-percentiles/);
        // The chip body renders the formatter output, not a direct
        // formatCompactCurrency(ale) call.
        const chip = risksClient.slice(
            risksClient.indexOf('data-testid={`risk-ale-'),
            risksClient.indexOf('</span>', risksClient.indexOf('data-testid={`risk-ale-')),
        );
        expect(chip).toMatch(/\{label\}/);
        expect(chip).not.toMatch(/formatCompactCurrency\(ale\)/);
    });

    test('risk detail meta strip', () => {
        expect(detailPage).toMatch(/formatTailAwareAle\(riskAleValue, tailP90/);
        expect(detailPage).toMatch(/\/risks\/tail-percentiles/);
        expect(detailPage).toMatch(/\{riskAleLabel\}/);
    });

    test('score explainer quant line', () => {
        expect(explainer).toMatch(/formatTailAwareAle\(ale, tailSnapshot\?\.byRisk\[riskId\]\?\.aleP90/);
        expect(explainer).toMatch(/getPerRiskPercentiles/);
    });

    test('dashboard top-10 and coherence rows', () => {
        const top10 = /formatTailAwareAle\(row\.ale, tailByRisk\[row\.id\]/;
        const coherence = /formatTailAwareAle\(f\.ale, tailByRisk\[f\.riskId\]/;
        expect(dashboard).toMatch(top10);
        expect(dashboard).toMatch(coherence);
    });

    test('PDF + PPTX rows, and the CSV data column', () => {
        expect(renderer).toMatch(/formatTailAwareAle\(r\.ale, r\.aleP90/);
        expect(renderer).toMatch(/Risk,Category,ALE,Bad year \(P90\)/);
        // CSV bad-year cell is empty (never the mean) without tail data.
        expect(renderer).toMatch(/r\.aleP90 != null && r\.aleP90 > r\.ale \? Math\.round\(r\.aleP90\) : ''/);
        // The assembler threads the cache into the rows.
        expect(reportUsecase).toMatch(/aleP90: tailByRisk\.get\(r\.id\) \?\? null/);
    });
});
