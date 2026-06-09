/**
 * RQ-3 — Monte Carlo engine. Deterministic (seeded) coverage of the PRNG,
 * PERT inverse-CDF sample, and the pure `simulatePortfolio`.
 */
import { createPRNG, samplePert, simulatePortfolio, type SimRisk } from '@/app-layer/usecases/monte-carlo';

describe('createPRNG', () => {
    it('is deterministic for a fixed seed', () => {
        const a = createPRNG(42); const b = createPRNG(42);
        const seqA = [a(), a(), a()]; const seqB = [b(), b(), b()];
        expect(seqA).toEqual(seqB);
        seqA.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
    });
    it('different seeds diverge', () => {
        expect(createPRNG(1)()).not.toBe(createPRNG(2)());
    });
});

describe('samplePert (triangular inverse CDF)', () => {
    const d = { min: 80_000, mode: 150_000, max: 300_000 };
    it('u=0 → min, u=1 → max', () => {
        expect(samplePert(d, 0)).toBe(80_000);
        expect(samplePert(d, 1)).toBe(300_000);
    });
    it('u at the mode-CDF returns the mode exactly', () => {
        const fc = (d.mode - d.min) / (d.max - d.min);
        expect(samplePert(d, fc)).toBeCloseTo(150_000, 0);
    });
    it('mid-uniform lands strictly within [min, max]', () => {
        const v = samplePert(d, 0.5);
        expect(v).toBeGreaterThan(d.min);
        expect(v).toBeLessThan(d.max);
    });
    it('degenerate (min==max) returns the point', () => {
        expect(samplePert({ min: 5, mode: 5, max: 5 }, 0.7)).toBe(5);
    });
});

describe('simulatePortfolio', () => {
    const pointRisk = (id: string, ale: number): SimRisk => ({ id, title: id, pointAle: ale });

    it('empty portfolio → all zeros, no throw', () => {
        const r = simulatePortfolio([], { iterations: 1000, seed: 1 });
        expect(r.portfolioAle.mean).toBe(0);
        expect(r.perRisk).toHaveLength(0);
        expect(r.lossExceedanceCurve).toHaveLength(0);
    });

    it('is deterministic for a fixed seed', () => {
        const risks = [pointRisk('a', 100_000), pointRisk('b', 50_000)];
        const a = simulatePortfolio(risks, { iterations: 2000, seed: 7 });
        const b = simulatePortfolio(risks, { iterations: 2000, seed: 7 });
        expect(a.portfolioAle.p95).toBe(b.portfolioAle.p95);
        expect(a.portfolioAle.mean).toBe(b.portfolioAle.mean);
    });

    it('portfolio mean ≈ sum of independent risk means (±5%)', () => {
        const risks = [pointRisk('a', 200_000), pointRisk('b', 100_000)];
        const r = simulatePortfolio(risks, { iterations: 20_000, seed: 3 });
        expect(r.portfolioAle.mean).toBeGreaterThan(285_000);
        expect(r.portfolioAle.mean).toBeLessThan(315_000);
    });

    it('per-risk contributions sum to ~1 and are ranked by mean', () => {
        const r = simulatePortfolio([pointRisk('big', 400_000), pointRisk('small', 100_000)], { iterations: 5000, seed: 5 });
        expect(r.perRisk[0].riskId).toBe('big');
        const total = r.perRisk.reduce((s, p) => s + p.contribution, 0);
        expect(total).toBeCloseTo(1, 1);
    });

    it('VaR ordering holds: p50 ≤ p95 ≤ p99 ≤ max', () => {
        const r = simulatePortfolio([pointRisk('a', 100_000)], { iterations: 10_000, seed: 9 });
        const { median, p95, p99, max } = r.portfolioAle;
        expect(median).toBeLessThanOrEqual(p95);
        expect(p95).toBeLessThanOrEqual(p99);
        expect(p99).toBeLessThanOrEqual(max);
    });

    it('converges (delta < 5%) at 20k iterations', () => {
        const r = simulatePortfolio([pointRisk('a', 100_000), pointRisk('b', 80_000)], { iterations: 20_000, seed: 11 });
        expect(r.convergenceDelta).toBeLessThan(0.05);
    });
});
