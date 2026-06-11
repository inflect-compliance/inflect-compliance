/**
 * RQ2-5 — qual ↔ quant coherence detector (pure-math suite).
 *
 * Fixture portfolios per the acceptance criteria: agreeing
 * portfolios stay silent; planted contradictions are flagged with
 * the right direction; small/unquantified portfolios cost nothing.
 */
import {
    detectIncoherence,
    formatCompactCurrency,
    MIN_QUANTIFIED_FOR_COHERENCE,
    type CoherenceInput,
} from '@/lib/risk-coherence';

const risk = (id: string, score: number, ale: number | null): CoherenceInput => ({
    id,
    title: `Risk ${id}`,
    score,
    ale,
});

describe('detectIncoherence — silence where silence is honest', () => {
    it('returns no flags for an empty portfolio', () => {
        const r = detectIncoherence([]);
        expect(r.flags).toEqual([]);
        expect(r.quantifiedCount).toBe(0);
        expect(r.totalCount).toBe(0);
    });

    it('stays silent below the minimum quantified count', () => {
        // 3 quantified — quartiles are meaningless; the wild
        // contradiction in r3 must NOT be flagged.
        const r = detectIncoherence([
            risk('r1', 20, 1_000_000),
            risk('r2', 15, 500_000),
            risk('r3', 2, 2_000_000),
            risk('r4', 25, null),
            risk('r5', 1, null),
        ]);
        expect(r.quantifiedCount).toBe(3);
        expect(r.minRequired).toBe(MIN_QUANTIFIED_FOR_COHERENCE);
        expect(r.flags).toEqual([]);
    });

    it('unquantified risks never participate in the ranking', () => {
        // Four agreeing quantified risks + a high-score unquantified
        // risk. The unquantified one cannot be flagged (no ALE) and
        // must not distort the quantified percentiles.
        const r = detectIncoherence([
            risk('q1', 20, 800_000),
            risk('q2', 15, 400_000),
            risk('q3', 10, 200_000),
            risk('q4', 5, 50_000),
            risk('u1', 25, null),
        ]);
        expect(r.quantifiedCount).toBe(4);
        expect(r.totalCount).toBe(5);
        expect(r.flags).toEqual([]);
    });

    it('an agreeing portfolio (rank-aligned) produces zero flags', () => {
        const aligned = Array.from({ length: 12 }, (_, i) =>
            risk(`r${i}`, i + 1, (i + 1) * 10_000),
        );
        expect(detectIncoherence(aligned).flags).toEqual([]);
    });

    it('identical scores everywhere cannot self-flag (mid-rank ties)', () => {
        const flat = Array.from({ length: 8 }, (_, i) =>
            risk(`r${i}`, 12, (i + 1) * 10_000),
        );
        // All score percentiles collapse to 0.5 — neither quartile.
        expect(detectIncoherence(flat).flags).toEqual([]);
    });
});

describe('detectIncoherence — planted contradictions', () => {
    // 7 rank-aligned risks + one contradiction each way.
    const aligned = Array.from({ length: 7 }, (_, i) =>
        risk(`bg${i}`, 6 + i * 2, (i + 1) * 100_000),
    );

    it('flags top-ALE / bottom-score as QUANT_HIGH_QUAL_LOW', () => {
        const r = detectIncoherence([
            ...aligned,
            risk('whale', 2, 5_000_000), // qual says minor; money says biggest
        ]);
        const flag = r.flags.find((f) => f.riskId === 'whale');
        expect(flag).toBeDefined();
        expect(flag!.direction).toBe('QUANT_HIGH_QUAL_LOW');
        expect(flag!.alePercentile).toBeGreaterThanOrEqual(0.75);
        expect(flag!.scorePercentile).toBeLessThanOrEqual(0.25);
    });

    it('flags top-score / bottom-ALE as QUAL_HIGH_QUANT_LOW', () => {
        const r = detectIncoherence([
            ...aligned,
            risk('paper-tiger', 25, 1_000), // qual says critical; money says noise
        ]);
        const flag = r.flags.find((f) => f.riskId === 'paper-tiger');
        expect(flag).toBeDefined();
        expect(flag!.direction).toBe('QUAL_HIGH_QUANT_LOW');
    });

    it('mid-rank risks are never flagged even in a noisy portfolio', () => {
        const r = detectIncoherence([
            ...aligned,
            risk('whale', 2, 5_000_000),
            risk('mid', 12, 350_000), // middle of both rankings
        ]);
        expect(r.flags.find((f) => f.riskId === 'mid')).toBeUndefined();
    });

    it('orders flags by percentile gap (worst disagreement first)', () => {
        const r = detectIncoherence([
            ...aligned,
            risk('whale', 2, 5_000_000),
            risk('paper-tiger', 25, 1_000),
        ]);
        expect(r.flags.length).toBeGreaterThanOrEqual(2);
        const gaps = r.flags.map((f) =>
            Math.abs(f.alePercentile - f.scorePercentile),
        );
        expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
    });
});

describe('formatCompactCurrency', () => {
    it.each([
        [900, '€900'],
        [43_000, '€43K'],
        [1_250_000, '€1.3M'],
        [999, '€999'],
        [1_000, '€1K'],
    ])('%d → %s', (input, expected) => {
        expect(formatCompactCurrency(input)).toBe(expected);
    });
});
