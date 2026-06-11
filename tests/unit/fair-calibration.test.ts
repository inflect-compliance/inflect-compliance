/**
 * RQ2-7 — FAIR calibration aids (pure-math suite).
 *
 * Reflections per field, frequency/probability phrasing across
 * scales, warn-only validators per class, PERT triple checks, and
 * the category prior library.
 */
import {
    reflectFairInput,
    reflectFrequency,
    reflectProbability,
    validateFairInputs,
    validatePertTriple,
    getCategoryPrior,
    CATEGORY_PRIORS,
    type FairFieldKey,
    type FairPointValues,
} from '@/lib/fair-calibration';

const EMPTY: FairPointValues = {
    contactFrequency: null,
    probabilityOfAction: null,
    threatEventFrequency: null,
    threatCapability: null,
    controlStrength: null,
    vulnerabilityProbability: null,
    productivityLoss: null,
    responseCost: null,
    replacementCost: null,
    primaryLossMagnitude: null,
    secondaryLossEventFrequency: null,
    secondaryLossMagnitude: null,
};

describe('reflectFrequency / reflectProbability', () => {
    it.each([
        [0.1, 'about one event every 10 years'],
        [0.5, 'about one event every 2 years'],
        [1, 'about 1× per year'],
        [12, 'about 12× per year'],
        [0, 'never (zero events expected)'],
    ])('frequency %d → %s', (input, expected) => {
        expect(reflectFrequency(input)).toBe(expected);
    });

    it.each([
        [0.25, 'a 1-in-4 chance (25%)'],
        [0.01, 'a 1-in-100 chance (1%)'],
        [1, 'certain (100% chance)'],
        [0, 'impossible (0% chance)'],
    ])('probability %d → %s', (input, expected) => {
        expect(reflectProbability(input)).toBe(expected);
    });
});

describe('reflectFairInput — every numeric FAIR input has a reflection', () => {
    const ALL_FIELDS: FairFieldKey[] = [
        'contactFrequency', 'probabilityOfAction', 'threatEventFrequency',
        'threatCapability', 'controlStrength', 'vulnerabilityProbability',
        'productivityLoss', 'responseCost', 'replacementCost',
        'primaryLossMagnitude', 'secondaryLossEventFrequency', 'secondaryLossMagnitude',
    ];

    it.each(ALL_FIELDS)('%s reflects a non-null value', (field) => {
        const reflection = reflectFairInput(field, 0.5);
        expect(reflection).toEqual(expect.any(String));
        expect(reflection!.length).toBeGreaterThan(10);
    });

    it('absent values reflect to null (UI renders nothing)', () => {
        expect(reflectFairInput('threatEventFrequency', null)).toBeNull();
        expect(reflectFairInput('primaryLossMagnitude', Number.NaN)).toBeNull();
    });

    it('TEF 0.1 reads as the once-per-decade sentence from the issue', () => {
        expect(reflectFairInput('threatEventFrequency', 0.1)).toMatch(/every 10 years/);
    });

    it('loss magnitudes reflect in compact currency', () => {
        expect(reflectFairInput('primaryLossMagnitude', 250_000)).toMatch(/€250K/);
    });
});

describe('validateFairInputs — warn, never block', () => {
    it('clean inputs warn nothing', () => {
        expect(
            validateFairInputs({
                ...EMPTY,
                threatEventFrequency: 0.2,
                vulnerabilityProbability: 0.4,
                primaryLossMagnitude: 100_000,
            }),
        ).toEqual([]);
    });

    it('flags probabilities outside 0–1 (the vulnerability > 1 case)', () => {
        const w = validateFairInputs({ ...EMPTY, vulnerabilityProbability: 1.4 });
        expect(w).toHaveLength(1);
        expect(w[0].field).toBe('vulnerabilityProbability');
    });

    it('flags 1–10 scale fields out of range', () => {
        const w = validateFairInputs({ ...EMPTY, threatCapability: 60 });
        expect(w.some((x) => x.field === 'threatCapability')).toBe(true);
    });

    it('flags negative money and negative frequencies', () => {
        const w = validateFairInputs({
            ...EMPTY,
            responseCost: -5,
            contactFrequency: -1,
        });
        expect(w.map((x) => x.field).sort()).toEqual(['contactFrequency', 'responseCost']);
    });

    it('flags a TEF override wildly above contact × P(action)', () => {
        const w = validateFairInputs({
            ...EMPTY,
            contactFrequency: 2,
            probabilityOfAction: 0.1,
            threatEventFrequency: 50,
        });
        expect(w.some((x) => x.field === 'threatEventFrequency')).toBe(true);
    });

    it('null-only input is silent (zero cost for unquantified risks)', () => {
        expect(validateFairInputs(EMPTY)).toEqual([]);
    });
});

describe('validatePertTriple', () => {
    it('accepts a sane range', () => {
        expect(validatePertTriple('PLM', { min: 10_000, mode: 50_000, max: 200_000 })).toEqual([]);
    });

    it('flags an inverted range', () => {
        const w = validatePertTriple('PLM', { min: 100, mode: 50, max: 200 });
        expect(w.some((x) => x.message.includes('inverted'))).toBe(true);
    });

    it('flags a range spanning more than 3 orders of magnitude', () => {
        const w = validatePertTriple('PLM', { min: 1_000, mode: 50_000, max: 10_000_000 });
        expect(w.some((x) => x.message.includes('orders of magnitude'))).toBe(true);
    });
});

describe('category priors', () => {
    it('known categories carry TEF + loss anchors', () => {
        for (const prior of Object.values(CATEGORY_PRIORS)) {
            expect(prior.tefHint).toMatch(/Reference:/);
            expect(prior.lossHint).toMatch(/Reference:/);
        }
        expect(getCategoryPrior('Technical')?.tefHint).toMatch(/TEF 0\.05–0\.5/);
    });

    it('unknown / absent categories return null (UI renders nothing)', () => {
        expect(getCategoryPrior('Quantum')).toBeNull();
        expect(getCategoryPrior(null)).toBeNull();
    });
});
