/**
 * Unit tests for the pure band-lookup helpers — Epic 44.2.
 */

import {
    resolveBandForScore,
    resolveBandTone,
    resolveCell,
    bandRangeLabel,
} from '@/lib/risk-matrix/scoring';
import { DEFAULT_RISK_MATRIX_CONFIG } from '@/lib/risk-matrix/defaults';
import type { RiskMatrixBand } from '@/lib/risk-matrix/types';

const bands = DEFAULT_RISK_MATRIX_CONFIG.bands;

describe('resolveBandForScore', () => {
    it.each([
        [1, 'Low'],
        [4, 'Low'],
        [5, 'Medium'],
        [9, 'Medium'],
        [10, 'High'],
        [14, 'High'],
        [15, 'Critical'],
        [25, 'Critical'],
    ])('score %i → %s band', (score, expected) => {
        expect(resolveBandForScore(score, bands).name).toBe(expected);
    });

    it('returns the neutral fallback when bands is empty', () => {
        expect(resolveBandForScore(10, []).name).toBe('Unbanded');
    });

    it('returns the neutral fallback when score is outside every band', () => {
        // single-band coverage [1..5] — score 10 falls outside
        const partial: RiskMatrixBand[] = [
            { name: 'Only', minScore: 1, maxScore: 5, color: '#000' },
        ];
        expect(resolveBandForScore(10, partial).name).toBe('Unbanded');
    });
});

describe('resolveBandTone', () => {
    // Ordinal-based over the 4-tier default: lowest → success, highest →
    // critical, middle → attention. This is the single vocabulary every
    // non-matrix surface (KPIStat tone, StatusBadge variant, score chip)
    // consumes, so the same score reads the same severity everywhere.
    it.each([
        [4, 'Low', 'success'],
        [5, 'Medium', 'attention'],
        [12, 'High', 'attention'],
        [15, 'Critical', 'critical'],
        [25, 'Critical', 'critical'],
    ])('score %i → %s band → %s tone', (score, bandName, tone) => {
        const r = resolveBandTone(score, bands);
        expect(r.band.name).toBe(bandName);
        expect(r.tone).toBe(tone);
    });

    it('empty bands resolve to the default tone (never throws)', () => {
        expect(resolveBandTone(10, []).tone).toBe('default');
    });

    it('honours a custom (non-5×5) band layout — score 30 on a 6×6 top band', () => {
        // A 6×6 tenant: top band covers 25–36. Score 30 must read critical
        // even though the legacy ≤18 ladder never reached that far.
        const sixBySix: RiskMatrixBand[] = [
            { name: 'Low', minScore: 1, maxScore: 8, color: '#22c55e' },
            { name: 'Moderate', minScore: 9, maxScore: 18, color: '#f59e0b' },
            { name: 'Severe', minScore: 19, maxScore: 36, color: '#7c2d12' },
        ];
        expect(resolveBandTone(30, sixBySix)).toEqual(
            expect.objectContaining({ tone: 'critical' }),
        );
        expect(resolveBandTone(30, sixBySix).band.name).toBe('Severe');
        expect(resolveBandTone(4, sixBySix).tone).toBe('success');
    });
});

describe('resolveCell', () => {
    it('computes likelihood × impact and resolves the band + per-axis labels', () => {
        const r = resolveCell(4, 5, DEFAULT_RISK_MATRIX_CONFIG);
        expect(r.score).toBe(20);
        expect(r.band.name).toBe('Critical');
        expect(r.likelihoodLabel).toBe('Likely');
        expect(r.impactLabel).toBe('Severe');
    });

    it('falls back to numeric labels when levelLabels are absent', () => {
        const noLabels = {
            ...DEFAULT_RISK_MATRIX_CONFIG,
            levelLabels: { likelihood: [], impact: [] },
        };
        const r = resolveCell(2, 3, noLabels);
        expect(r.likelihoodLabel).toBe('2');
        expect(r.impactLabel).toBe('3');
    });
});

describe('bandRangeLabel', () => {
    it('renders a single-score band as just the number', () => {
        expect(
            bandRangeLabel({ name: 'Pinpoint', minScore: 5, maxScore: 5, color: '#000' }),
        ).toBe('5');
    });
    it('renders an open-ended band with a + suffix', () => {
        expect(
            bandRangeLabel({
                name: 'Tail',
                minScore: 100,
                maxScore: Number.POSITIVE_INFINITY,
                color: '#000',
            }),
        ).toBe('100+');
    });
    it('renders a closed range with an en-dash', () => {
        expect(
            bandRangeLabel({ name: 'Mid', minScore: 5, maxScore: 9, color: '#000' }),
        ).toBe('5–9');
    });
});
