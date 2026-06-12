/**
 * RQ3-7 — "KRI ⇄ assessment loop: sensors finally update beliefs"
 * ratchet.
 *
 * RQ-6's KRIs were sensors wired to nothing — a breached indicator
 * changed no conclusion anywhere. This ratchet locks the loop shut:
 *
 *   - SIGNAL_MOVED is a first-class staleness reason in the pure
 *     detector, gated on a KRI breach NEWER than the last assessment
 *     (no-noise: a stale breach the belief already absorbed doesn't
 *     fire; un-breaching clears it);
 *   - the staleness loader feeds the breach signal from the KRI
 *     readings, batched (no per-risk read);
 *   - the Assessment tab carries the re-assess nudge;
 *   - the KRI page deep-links a breached, risk-linked KRI to that
 *     risk's Assessment tab, and the detail page honours `?tab=`.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const lib = read('src/lib/risk-staleness.ts');
const loader = read('src/app-layer/usecases/risk-staleness.ts');
const kriUsecase = read('src/app-layer/usecases/key-risk-indicator.ts');
const breachRoute = read('src/app/api/t/[tenantSlug]/risks/[id]/kri-breaches/route.ts');
const assessmentPanel = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel.tsx');
const kriPage = read('src/app/t/[tenantSlug]/(app)/risks/kri/page.tsx');
const detailPage = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx');

describe('RQ3-7 — SIGNAL_MOVED is a first-class staleness reason', () => {
    test('the pure detector adds the reason + its signal + description', () => {
        expect(lib).toMatch(/'SIGNAL_MOVED'/);
        expect(lib).toMatch(/latestKriBreachAt: Date \| null/);
        expect(lib).toMatch(/reasons\.push\('SIGNAL_MOVED'\)/);
        expect(lib).toMatch(/a key risk indicator breached since the last assessment/);
    });

    test('the no-noise gate: breach must be newer than the last assessment', () => {
        // Either never assessed (live signal against no conclusion) or
        // the breach post-dates the most recent assessment.
        expect(lib).toMatch(/signals\.lastAssessedAt === null \|\|\s*signals\.latestKriBreachAt > signals\.lastAssessedAt/);
    });
});

describe('RQ3-7 — the loader feeds the breach signal, batched', () => {
    test('latest currently-RED KRI reading per risk, via groupBy (no per-risk read)', () => {
        expect(loader).toMatch(/loadLatestKriBreaches/);
        expect(loader).toMatch(/kriReading\.groupBy/);
        expect(loader).toMatch(/ragStatus !== 'RED'/);
        expect(loader).toMatch(/latestKriBreachAt: latestKriBreachByRisk\.get\(r\.id\)/);
    });
});

describe('RQ3-7 — the loop surfaces in the UI', () => {
    test('the KRI usecase exposes per-risk breaches for the nudge', () => {
        expect(kriUsecase).toMatch(/export async function getRiskKriBreaches/);
        expect(kriUsecase).toMatch(/ragStatus: 'RED'/);
        expect(breachRoute).toMatch(/getRiskKriBreaches/);
        expect(breachRoute).toMatch(/export const GET = withApiErrorHandling/);
    });

    test('the Assessment tab renders the re-assess nudge from the breach signal', () => {
        expect(assessmentPanel).toMatch(/kri-breaches/);
        expect(assessmentPanel).toMatch(/kri-reassess-nudge/);
        expect(assessmentPanel).toMatch(/re-assess/i);
    });

    test('the KRI page deep-links a breached, risk-linked KRI to the assessment tab', () => {
        expect(kriPage).toMatch(/riskId: string \| null/);
        expect(kriPage).toMatch(/k\.latestReading\?\.ragStatus === 'RED'/);
        expect(kriPage).toMatch(/\/risks\/\$\{k\.riskId\}\?tab=assessment/);
        expect(kriPage).toMatch(/kri-reassess-link-/);
    });

    test('the risk detail page honours the ?tab= deep-link', () => {
        expect(detailPage).toMatch(/useSearchParams/);
        expect(detailPage).toMatch(/searchParams\?\.get\('tab'\)/);
        expect(detailPage).toMatch(/useState<Tab>\(initialTab\)/);
    });
});
