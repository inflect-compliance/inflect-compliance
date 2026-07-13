/**
 * Item 25 — weighted asset-criticality ratchet.
 *
 * Locks in the aggregation model that replaced the old high-water-mark
 * (`Math.max(C, I, A)`) rule, so a future "simplify the scoring" revert
 * can't silently bring back single-dimension dominance:
 *
 *   1. **No lone-high dominance.** A single elevated-but-not-ceiling
 *      dimension (4) with the other two minimal (1) must NOT band as
 *      High — under the old max() rule it did. It must read at most
 *      Medium.
 *
 *   2. **Critical override preserved.** A single ceiling dimension (5)
 *      with the other two minimal MUST still read Critical — the one
 *      case where high-water-mark behaviour is intentionally kept.
 *
 *   3. **Two elevated dimensions DO raise the band.** 4/4/1 reads High —
 *      the model is "top-two mean", not "ignore everything but the
 *      lowest".
 *
 *   4. **All-high without a ceiling is not Critical.** 4/4/4 reads High,
 *      not Critical — Critical is reserved for an actual ceiling
 *      dimension.
 *
 * Structural backstop: the source must no longer band directly off the
 * three-way `Math.max(...)` of the raw dimensions.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAssetCriticality } from '@/lib/asset-criticality';

// The pure derivation now lives in `src/lib/asset-criticality.ts` (shared by
// the client form + the server create/update usecase). The client
// `_form/asset-criticality.ts` re-exports it.
const SOURCE = path.resolve(
    __dirname,
    '../../src/lib/asset-criticality.ts',
);

describe('item 25 — weighted asset criticality', () => {
    it('a single non-ceiling high dimension does NOT band as High', () => {
        // 4/1/1 was High under the old Math.max rule. The weighted model
        // pulls it down — the asset is not dominated by one dimension.
        const r = getAssetCriticality(4, 1, 1);
        expect(r.label).not.toBe('High');
        expect(r.label).not.toBe('Critical');
        expect(['Low', 'Medium']).toContain(r.label);
    });

    it('a single ceiling (5) dimension still forces Critical (override)', () => {
        for (const [c, i, a] of [
            [5, 1, 1],
            [1, 5, 1],
            [1, 1, 5],
        ] as const) {
            const r = getAssetCriticality(c, i, a);
            expect(r.label).toBe('Critical');
            expect(r.tone).toBe('critical');
        }
    });

    it('two elevated dimensions DO raise the band to High', () => {
        expect(getAssetCriticality(4, 4, 1).label).toBe('High');
        expect(getAssetCriticality(4, 3, 1).label).toBe('High');
    });

    it('all-high without a ceiling dimension is High, not Critical', () => {
        expect(getAssetCriticality(4, 4, 4).label).toBe('High');
    });

    it('the displayed score integer always matches its band', () => {
        // No fractional / mismatched score-vs-label pairs.
        for (let c = 1; c <= 5; c++)
            for (let i = 1; i <= 5; i++)
                for (let a = 1; a <= 5; a++) {
                    const r = getAssetCriticality(c, i, a);
                    expect(Number.isInteger(r.score)).toBe(true);
                    if (r.label === 'Critical') expect(r.score).toBe(5);
                    if (r.label === 'High') expect(r.score).toBe(4);
                    if (r.label === 'Medium') expect(r.score).toBe(3);
                    if (r.label === 'Low') expect(r.score).toBeLessThanOrEqual(2);
                }
    });

    it('source no longer bands directly off the three-way Math.max of raw dimensions', () => {
        const src = fs.readFileSync(SOURCE, 'utf8');
        // The old rule was `const score = Math.max(confidentiality,
        // integrity, availability);` followed by banding on `score`.
        // The override path may still peek at the peak via
        // `Math.max(...dims)`, but the BANDING must come from the
        // top-two mean. Assert the top-two-mean construct is present.
        expect(src).toMatch(/sort\(/);
        expect(src).toMatch(/hi \+ mid|mid \+ hi/);
        // And the old single-expression band source is gone.
        expect(src).not.toMatch(
            /const score = Math\.max\(confidentiality, integrity, availability\)/,
        );
    });
});
