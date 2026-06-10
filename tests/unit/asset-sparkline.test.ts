/**
 * Asset sparkline trim — the fix for the "retired curve is wrong" bug.
 *
 * ComplianceSnapshot asset columns are @default(0) and shipped 2026-06-07, so
 * pre-column snapshots read 0 for every asset metric. Plotting those defaulted
 * zeros made a 1-retired-asset tenant render `[0,0,…,0,1,1]` (a fake ramp)
 * instead of the truthful flat `1`. `firstAssetDataIndex` finds where real data
 * begins (gated on total>0) so all four series can be sliced date-aligned.
 */
import { firstAssetDataIndex } from '@/lib/assets/asset-sparkline';

const pts = (...vals: number[]) => vals.map((value) => ({ value }));

describe('firstAssetDataIndex', () => {
    it('skips the leading defaulted-zero prefix', () => {
        // 27 false zeros then real data → first real day is index 27.
        const total = pts(...Array(27).fill(0), 5, 5, 5);
        expect(firstAssetDataIndex(total)).toBe(27);
    });

    it('returns 0 when the very first day already has data', () => {
        expect(firstAssetDataIndex(pts(3, 4, 5))).toBe(0);
    });

    it('returns length (drop all) when every day is zero — a genuinely empty tenant', () => {
        expect(firstAssetDataIndex(pts(0, 0, 0))).toBe(3);
        expect(firstAssetDataIndex([])).toBe(0);
    });

    it('the retired curve becomes truthful: slicing by total turns [0..0,1,1,1] into [1,1,1]', () => {
        // The bug scenario: 1 retired asset, total ramps from defaulted 0.
        const total = pts(0, 0, 0, 4, 4, 4);
        const retired = pts(0, 0, 0, 1, 1, 1);
        const start = firstAssetDataIndex(total);
        expect(retired.slice(start).map((p) => p.value)).toEqual([1, 1, 1]); // flat, not a ramp
        expect(total.slice(start).map((p) => p.value)).toEqual([4, 4, 4]);
    });
});
