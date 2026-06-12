/**
 * RQ3-4 — the one tail-aware ALE formatter (pure).
 */
import { formatTailAwareAle } from '@/lib/tail-language';
import { formatCompactCurrency } from '@/lib/risk-coherence';

const money = (v: number | null | undefined) => formatCompactCurrency(v);

describe('formatTailAwareAle', () => {
    it('speaks both registers when a real tail exists', () => {
        expect(formatTailAwareAle(120_000, 1_400_000, { money })).toBe(
            'expected €120K · bad year €1.4M (P90)',
        );
        expect(formatTailAwareAle(120_000, 1_400_000, { money, compact: true })).toBe(
            '€120K · bad yr €1.4M',
        );
    });

    it('mean register carries the honest suffix on full surfaces only', () => {
        expect(formatTailAwareAle(120_000, null, { money })).toBe(
            '€120K/yr (mean — run a simulation for tails)',
        );
        expect(formatTailAwareAle(120_000, null, { money, compact: true })).toBe('€120K');
    });

    it('a P90 at or below the mean is NOT tail data (pre-RQ3-1 degrade)', () => {
        expect(formatTailAwareAle(120_000, 120_000, { money, compact: true })).toBe('€120K');
        expect(formatTailAwareAle(120_000, 90_000, { money, compact: true })).toBe('€120K');
    });

    it('no mean → nothing to say', () => {
        expect(formatTailAwareAle(null, 1_000_000, { money })).toBeNull();
        expect(formatTailAwareAle(undefined, null, { money })).toBeNull();
        expect(formatTailAwareAle(Number.NaN, null, { money })).toBeNull();
    });

    it('composes with a tenant-symbol-bound formatter (one voice)', () => {
        const usd = (v: number | null | undefined) => formatCompactCurrency(v, '$');
        expect(formatTailAwareAle(120_000, 1_400_000, { money: usd })).toBe(
            'expected $120K · bad year $1.4M (P90)',
        );
    });
});
