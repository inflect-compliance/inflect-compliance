/**
 * Report-schedule + polish ratchet.
 *
 * Locks the five gap-closures: risk-scoped scheduled deep-dives,
 * schedule edit, import out-of-scale notice, scenario
 * correlationsDropped, and the two cleanups (treatment-plan doc header,
 * single matrix-config fetch).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const REPORTS = read('src/app/t/[tenantSlug]/(app)/risks/reports/page.tsx');
const IMPORT = read('src/app/t/[tenantSlug]/(app)/risks/import/page.tsx');
const SCENARIOS = read('src/app/t/[tenantSlug]/(app)/risks/scenarios/page.tsx');
const PLAN = read('src/app-layer/usecases/risk-treatment-plan.ts');
const PANEL = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/RiskAssessmentPanel.tsx');
const DETAIL = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx');
const FAIR = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/FairAnalysisPanel.tsx');

describe('1. scheduled deep-dive can be risk-scoped', () => {
    it('the schedule-create form picks a risk and sends parameters.riskId', () => {
        expect(REPORTS).toMatch(/selectedIsDeepDive/);
        expect(REPORTS).toMatch(/id="schedule-deepdive-risk"/);
        expect(REPORTS).toMatch(/parameters: \{ riskId \}/);
    });
});

describe('2. schedules can be edited in place', () => {
    it('an edit affordance PATCHes cadence + recipients', () => {
        expect(REPORTS).toMatch(/const startEdit/);
        expect(REPORTS).toMatch(/const saveEdit/);
        expect(REPORTS).toMatch(/schedule-edit-btn-/);
        expect(REPORTS).toMatch(/patch\(id, \{ cadence: editCadence, recipients: emails \}\)/);
    });
});

describe('3. import flags out-of-scale values per row', () => {
    it('captures the raw out-of-scale value + renders a per-row notice', () => {
        expect(IMPORT).toMatch(/outOfScale/);
        expect(IMPORT).toMatch(/data-testid="import-out-of-scale"/);
        expect(IMPORT).toMatch(/outOfScaleLikelihood|outOfScaleImpact/);
    });
});

describe('4. scenario result surfaces dropped correlations', () => {
    it('the comparison type carries correlationsDropped + a warning renders', () => {
        expect(SCENARIOS).toMatch(/correlationsDropped\?:\s*boolean/);
        expect(SCENARIOS).toMatch(/data-testid="scenario-correlations-dropped"/);
    });
});

describe('5. cleanups', () => {
    it('the treatment-plan doc header reflects MITIGATE → MITIGATED', () => {
        expect(PLAN).toMatch(/MITIGATE → MITIGATED/);
        expect(PLAN).not.toMatch(/MITIGATE → CLOSED/);
    });
    it('the assessment panel takes matrixConfig + does not re-fetch it', () => {
        expect(PANEL).toMatch(/matrixConfig: RiskMatrixConfigShape/);
        expect(PANEL).not.toMatch(/fetch\(apiUrl\('\/risk-matrix-config'\)\)/);
        expect(DETAIL).toMatch(/matrixConfig=\{matrixConfig\}/);
    });
    it('FairAnalysisPanel documents the BIA scope decision', () => {
        expect(FAIR).toMatch(/BIA fields stay out of this panel/);
    });
});
