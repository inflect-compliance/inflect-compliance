/**
 * RQ2-7 — calibration-aids ratchet.
 *
 * Regression classes guarded:
 *
 *   - the FAIR panel dropping its reflections / warnings / priors
 *     wiring (raw floats again — garbage-in one typo away);
 *   - warnings mutating from advisory into blocking (the save
 *     button must never couple to the validator output);
 *   - the reflection map silently losing a field (the TS switch in
 *     reflectFairInput is exhaustive over FairFieldKey — this test
 *     pins the panel-side coverage);
 *   - accepted AI suggestions losing their AI-source provenance
 *     event (RQ2-1 would silently mis-attribute them again).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const panel = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/FairAnalysisPanel.tsx');
const lib = read('src/lib/fair-calibration.ts');
const suggestions = read('src/app-layer/usecases/risk-suggestions.ts');
const detailPage = read('src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx');

describe('RQ2-7 — the FAIR panel speaks human', () => {
    test('every input renders through the reflecting field helper', () => {
        expect(panel).toMatch(/reflectFairInput/);
        // The field() helper is the single input renderer — no bare
        // <Input> for a FAIR number outside it.
        const fieldCalls = panel.match(/\{field\(/g) ?? [];
        expect(fieldCalls.length).toBeGreaterThanOrEqual(12);
    });

    test('warnings are wired and advisory-only (save never couples to them)', () => {
        expect(panel).toMatch(/validateFairInputs/);
        expect(panel).toMatch(/fair-calibration-warnings/);
        // The save button's disabled state depends on `saving` ONLY.
        expect(panel).toMatch(/disabled=\{saving\}/);
        expect(panel).not.toMatch(/disabled=\{[^}]*warnings/);
    });

    test('category priors are wired from the detail page', () => {
        expect(panel).toMatch(/getCategoryPrior/);
        expect(detailPage).toMatch(/category=\{risk\.category\}/);
    });

    test('the reflection switch is exhaustive over the panel field set', () => {
        // Every FieldKey the panel renders must appear in the lib's
        // FairFieldKey union (TS enforces switch exhaustiveness; this
        // pins the union ↔ panel pairing).
        const fields = [
            'contactFrequency', 'probabilityOfAction', 'threatEventFrequency',
            'threatCapability', 'controlStrength', 'vulnerabilityProbability',
            'productivityLoss', 'responseCost', 'replacementCost',
            'primaryLossMagnitude', 'secondaryLossEventFrequency', 'secondaryLossMagnitude',
        ];
        for (const f of fields) {
            expect(lib).toMatch(new RegExp(`'${f}'`));
            expect(panel).toMatch(new RegExp(`'${f}'`));
        }
    });
});

describe('RQ2-7 — AI provenance', () => {
    test('applySession records an AI-source inherent event per created risk', () => {
        expect(suggestions).toMatch(/import \{ recordScoreEvent \} from '\.\/risk-score-events'/);
        expect(suggestions).toMatch(/source:\s*'AI'/);
        expect(suggestions).toMatch(/kind:\s*'INHERENT'/);
    });

    test('validators stay pure (no DB, no ctx import in the lib)', () => {
        expect(lib).not.toMatch(/from '@\/lib\/db/);
        expect(lib).not.toMatch(/RequestContext/);
        expect(lib).not.toMatch(/prisma/i);
    });
});
