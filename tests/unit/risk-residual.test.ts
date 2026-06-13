/**
 * RQ2-2 — pure-math suite for `@/lib/risk-residual`.
 *
 * The formula IS the product here: layered combination, mitigation-
 * type routing, the 80% cap, exclusion semantics, ceil/clamp
 * suggestion, and the human description.
 */
import {
    combineEffectiveness,
    suggestResidual,
    describeCombination,
    describeAcceptedResidual,
    MAX_REDUCTION,
    type ControlEffectivenessInput,
} from '@/lib/risk-residual';

const control = (over: Partial<ControlEffectivenessInput>): ControlEffectivenessInput => ({
    controlId: 'c-1',
    code: 'CTL-1',
    name: 'Control',
    mitigationType: 'PREVENTIVE',
    effectiveness: 50,
    source: 'DECLARED',
    ...over,
});

describe('combineEffectiveness — layering', () => {
    it('single 50% preventive control → 0.5 likelihood reduction, 0 impact', () => {
        const r = combineEffectiveness([control({})]);
        expect(r.likelihoodReduction).toBeCloseTo(0.5);
        expect(r.impactReduction).toBe(0);
        expect(r.participatingCount).toBe(1);
    });

    it('two 50% preventive controls layer to 75% (1 − 0.5·0.5)', () => {
        const r = combineEffectiveness([
            control({ controlId: 'c-1' }),
            control({ controlId: 'c-2' }),
        ]);
        expect(r.likelihoodReduction).toBeCloseTo(0.75);
    });

    it('three 60% preventive controls cap at MAX_REDUCTION (0.8), not 93.6%', () => {
        const r = combineEffectiveness([
            control({ controlId: 'c-1', effectiveness: 60 }),
            control({ controlId: 'c-2', effectiveness: 60 }),
            control({ controlId: 'c-3', effectiveness: 60 }),
        ]);
        expect(r.likelihoodReduction).toBe(MAX_REDUCTION);
    });

    it('routes by mitigationType: PREVENTIVE/DETERRENT → likelihood; DETECTIVE/CORRECTIVE/COMPENSATING → impact', () => {
        const r = combineEffectiveness([
            control({ controlId: 'c-1', mitigationType: 'DETERRENT', effectiveness: 40 }),
            control({ controlId: 'c-2', mitigationType: 'DETECTIVE', effectiveness: 30 }),
            control({ controlId: 'c-3', mitigationType: 'CORRECTIVE', effectiveness: 30 }),
            control({ controlId: 'c-4', mitigationType: 'COMPENSATING', effectiveness: 30 }),
        ]);
        expect(r.likelihoodReduction).toBeCloseTo(0.4);
        // 1 − 0.7³ = 0.657
        expect(r.impactReduction).toBeCloseTo(0.657, 3);
        const affects = r.contributions.map((c) => c.affects);
        expect(affects).toEqual(['LIKELIHOOD', 'IMPACT', 'IMPACT', 'IMPACT']);
    });

    it('excludes controls without an effectiveness signal, with a visible reason', () => {
        const r = combineEffectiveness([
            control({ controlId: 'c-1', effectiveness: null, source: null }),
            control({ controlId: 'c-2', effectiveness: 0 }),
        ]);
        expect(r.participatingCount).toBe(0);
        expect(r.likelihoodReduction).toBe(0);
        expect(r.contributions[0].excludedReason).toBe('NO_EFFECTIVENESS');
        expect(r.contributions[1].excludedReason).toBe('NO_EFFECTIVENESS');
    });

    it('excludes controls without a mitigationType, with a visible reason', () => {
        const r = combineEffectiveness([control({ mitigationType: null })]);
        expect(r.participatingCount).toBe(0);
        expect(r.contributions[0].excludedReason).toBe('NO_MITIGATION_TYPE');
    });

    it('clamps out-of-range effectiveness into 0–100', () => {
        const r = combineEffectiveness([control({ effectiveness: 250 })]);
        // 250 clamps to 100 → reduction would be 1.0 → capped at 0.8.
        expect(r.likelihoodReduction).toBe(MAX_REDUCTION);
    });
});

describe('suggestResidual — ceil + clamp + derived rollup', () => {
    it('5/5 inherent with 60% L + 50% I reductions → ceil(2)/ceil(2.5)=3 → score 6', () => {
        const s = suggestResidual(5, 5, { likelihoodReduction: 0.6, impactReduction: 0.5 }, 5);
        expect(s.residualLikelihood).toBe(2);
        expect(s.residualImpact).toBe(3);
        expect(s.residualScore).toBe(6);
    });

    it('never suggests below 1 on either dimension (max reduction on a 1/1 risk stays 1/1)', () => {
        const s = suggestResidual(1, 1, { likelihoodReduction: 0.8, impactReduction: 0.8 }, 5);
        expect(s.residualLikelihood).toBe(1);
        expect(s.residualImpact).toBe(1);
        expect(s.residualScore).toBe(1);
    });

    it('zero reductions → suggestion equals the inherent assessment', () => {
        const s = suggestResidual(4, 3, { likelihoodReduction: 0, impactReduction: 0 }, 5);
        expect(s.residualLikelihood).toBe(4);
        expect(s.residualImpact).toBe(3);
        expect(s.residualScore).toBe(12);
    });

    it('honours a non-default maxScale in the rollup clamp', () => {
        const s = suggestResidual(10, 10, { likelihoodReduction: 0.3, impactReduction: 0 }, 10);
        expect(s.residualLikelihood).toBe(7);
        expect(s.residualScore).toBe(70);
    });
});

describe('describeCombination — the human line', () => {
    it('renders both dimensions with counts + percentages', () => {
        const r = combineEffectiveness([
            control({ controlId: 'c-1', effectiveness: 50 }),
            control({ controlId: 'c-2', effectiveness: 50 }),
            control({ controlId: 'c-3', mitigationType: 'CORRECTIVE', effectiveness: 60 }),
        ]);
        const line = describeCombination(r);
        expect(line).toMatch(/2 likelihood-reducing controls → 75% combined likelihood reduction/);
        expect(line).toMatch(/1 impact-reducing control → 60% combined impact reduction/);
    });

    it('says so plainly when nothing participates', () => {
        const r = combineEffectiveness([control({ effectiveness: null, source: null })]);
        expect(describeCombination(r)).toMatch(/No linked controls carry an effectiveness signal/);
    });
});

describe('describeAcceptedResidual — RQ3-OB-D accept-toast one-liner', () => {
    it('leads with the residual score, then controls + per-dim percentages', () => {
        const line = describeAcceptedResidual(
            { residualScore: 8, likelihoodReduction: 0.6, impactReduction: 0.3 },
            2,
        );
        expect(line).toBe('Residual 8 — 2 controls, 60% likelihood / 30% impact');
    });

    it('singularises one control', () => {
        const line = describeAcceptedResidual(
            { residualScore: 12, likelihoodReduction: 0.5, impactReduction: 0 },
            1,
        );
        expect(line).toBe('Residual 12 — 1 control, 50% likelihood / 0% impact');
    });

    it('rounds the reductions to whole percent', () => {
        const line = describeAcceptedResidual(
            { residualScore: 6, likelihoodReduction: 0.666, impactReduction: 0.334 },
            3,
        );
        expect(line).toBe('Residual 6 — 3 controls, 67% likelihood / 33% impact');
    });
});
