/**
 * RQ-8 — correlation math (pure): Cholesky, PSD, correlated uniforms,
 * and shared-asset/control suggestions. No DB.
 */
import { choleskyDecompose, generateCorrelatedUniforms, createPRNG } from '@/app-layer/usecases/monte-carlo';
import { validatePSD, computeSuggestions } from '@/app-layer/usecases/risk-correlation';

// Pearson correlation of two equal-length samples.
function pearson(a: number[], b: number[]): number {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return num / Math.sqrt(da * db);
}

describe('choleskyDecompose', () => {
    it('returns a valid lower-triangular factor (L·Lᵀ = Σ)', () => {
        const L = choleskyDecompose([[1, 0.5], [0.5, 1]]);
        expect(L[0][1]).toBe(0); // lower triangular
        // reconstruct
        const r00 = L[0][0] * L[0][0];
        const r10 = L[1][0] * L[0][0];
        const r11 = L[1][0] * L[1][0] + L[1][1] * L[1][1];
        expect(r00).toBeCloseTo(1, 6);
        expect(r10).toBeCloseTo(0.5, 6);
        expect(r11).toBeCloseTo(1, 6);
    });

    it('throws on a non-positive-definite matrix', () => {
        // coefficient > 1 → indefinite
        expect(() => choleskyDecompose([[1, 1.5], [1.5, 1]])).toThrow();
    });
});

describe('validatePSD', () => {
    it('accepts a PSD matrix', () => {
        const r = validatePSD([[1, 0.5], [0.5, 1]]);
        expect(r.valid).toBe(true);
        expect(r.minEigenvalue).toBeGreaterThan(0);
    });
    it('rejects a non-PSD matrix (negative min eigenvalue)', () => {
        const r = validatePSD([[1, 1.5], [1.5, 1]]);
        expect(r.valid).toBe(false);
        expect(r.minEigenvalue).toBeLessThan(0);
    });
});

describe('generateCorrelatedUniforms', () => {
    it('identity matrix → ~uncorrelated samples', () => {
        const L = choleskyDecompose([[1, 0], [0, 1]]);
        const rng = createPRNG(7);
        const a: number[] = [], b: number[] = [];
        for (let i = 0; i < 4000; i++) { const u = generateCorrelatedUniforms(L, rng); a.push(u[0]); b.push(u[1]); }
        expect(Math.abs(pearson(a, b))).toBeLessThan(0.1);
    });
    it('[[1,0.9],[0.9,1]] → strongly correlated samples (r > 0.8)', () => {
        const L = choleskyDecompose([[1, 0.9], [0.9, 1]]);
        const rng = createPRNG(7);
        const a: number[] = [], b: number[] = [];
        for (let i = 0; i < 4000; i++) { const u = generateCorrelatedUniforms(L, rng); a.push(u[0]); b.push(u[1]); }
        expect(pearson(a, b)).toBeGreaterThan(0.8);
    });
});

describe('computeSuggestions', () => {
    const R = (id: string, assetIds: string[], controlIds: string[]) => ({ riskId: id, assetIds, controlIds });
    it('two risks sharing 1 asset → ≈0.4', () => {
        const s = computeSuggestions([R('a', ['x'], []), R('b', ['x'], [])]);
        expect(s).toHaveLength(1);
        expect(s[0].suggestedCoefficient).toBeCloseTo(0.4, 5);
    });
    it('two risks sharing 2 controls → ≈0.4', () => {
        const s = computeSuggestions([R('a', [], ['c1', 'c2']), R('b', [], ['c1', 'c2'])]);
        expect(s[0].suggestedCoefficient).toBeCloseTo(0.4, 5);
    });
    it('no shared assets/controls → no suggestion', () => {
        expect(computeSuggestions([R('a', ['x'], []), R('b', ['y'], [])])).toHaveLength(0);
    });
    it('caps the suggested coefficient at 0.8', () => {
        const many = Array.from({ length: 10 }, (_, i) => `x${i}`);
        const s = computeSuggestions([R('a', many, []), R('b', many, [])]);
        expect(s[0].suggestedCoefficient).toBeLessThanOrEqual(0.8);
    });
});
