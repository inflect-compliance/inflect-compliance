/**
 * Asset sparkline trim — the fix for the "retired curve is wrong" bug.
 *
 * ComplianceSnapshot asset columns are @default(0) and shipped 2026-06-07, so
 * pre-column snapshots read 0 for every asset metric. Plotting those defaulted
 * zeros made a 1-retired-asset tenant render `[0,0,…,0,1,1]` (a fake ramp)
 * instead of the truthful flat `1`. `firstAssetDataIndex` finds where real data
 * begins (gated on total>0) so all four series can be sliced date-aligned.
 */
import {
    firstAssetDataIndex,
    centeredSparklineDomain,
} from '@/lib/assets/asset-sparkline';

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

describe('centeredSparklineDomain — sparklines sit at the same vertical level', () => {
    const s = (vals: number[]) => vals.map((value) => ({ value }));

    it('centers a ramping series (data in the middle band, equal padding)', () => {
        // [0..10] → pad = 5 → [-5, 15]; the data midpoint (5) is the domain
        // midpoint, so the line is vertically centered.
        expect(centeredSparklineDomain(s([0, 5, 10]))).toEqual([-5, 15]);
    });

    it('returns undefined for a constant series (chart auto-fit centers it)', () => {
        expect(centeredSparklineDomain(s([3, 3, 3]))).toBeUndefined();
        expect(centeredSparklineDomain(s([0, 0]))).toBeUndefined();
    });

    it('returns undefined for an empty/undefined series', () => {
        expect(centeredSparklineDomain([])).toBeUndefined();
        expect(centeredSparklineDomain(undefined)).toBeUndefined();
    });

    it('a low-magnitude and a high-magnitude series both center (same level)', () => {
        // The old shared [0,max] domain put these at different heights; centered
        // per-series domains place each series midpoint at the vertical center.
        const low = centeredSparklineDomain(s([1, 2]))!;
        const high = centeredSparklineDomain(s([90, 100]))!;
        const mid = (d: [number, number]) => (d[0] + d[1]) / 2;
        expect(mid(low)).toBe(1.5); // midpoint of [1,2]
        expect(mid(high)).toBe(95); // midpoint of [90,100]
        // each series' own data midpoint == its domain midpoint → centered
    });
});
