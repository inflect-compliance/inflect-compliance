/**
 * PR-L — loss-event calibration back-test (pure helper).
 *
 * Scores per-risk actuals against the sim's P50/P90 forecast band and
 * reports coverage + a per-risk verdict. Never mutates FAIR inputs — the
 * page uses the verdict to nudge, not to auto-calibrate.
 */
import { computeLossCalibration } from '@/lib/risk/loss-calibration';

const F = (riskId: string, p50: number, p90: number, title = riskId) => ({ riskId, title, p50, p90 });
const A = (riskId: string, total: number) => ({ riskId, total });

describe('computeLossCalibration', () => {
    it('classifies within-band, under-forecast, and over-forecast', () => {
        const r = computeLossCalibration(
            [F('a', 100, 200), F('b', 100, 200), F('c', 100, 200)],
            [A('a', 150), A('b', 300), A('c', 50)],
        );
        const byId = Object.fromEntries(r.rows.map((x) => [x.riskId, x.status]));
        expect(byId.a).toBe('within_band');
        expect(byId.b).toBe('under_forecast'); // 300 > P90 200
        expect(byId.c).toBe('over_forecast');  // 50 < P50 100
        expect(r.scored).toBe(3);
        expect(r.underForecast).toBe(1);
        expect(r.overForecast).toBe(1);
        expect(r.withinBand).toBe(1);
    });

    it('coverage = fraction at/under P90; a perfect band read scores ~1', () => {
        const r = computeLossCalibration(
            Array.from({ length: 10 }, (_, i) => F(`r${i}`, 100, 200)),
            // 9 within P90, 1 over → 90% coverage → calibration ~1.
            Array.from({ length: 10 }, (_, i) => A(`r${i}`, i === 0 ? 300 : 150)),
        );
        expect(r.coverageWithinP90).toBeCloseTo(0.9, 5);
        expect(r.calibrationScore).toBeCloseTo(1, 5);
    });

    it('only scores risks that have BOTH a forecast and actuals', () => {
        const r = computeLossCalibration([F('a', 100, 200)], [A('b', 500)]);
        expect(r.scored).toBe(0);
        expect(r.coverageWithinP90).toBeNull();
        expect(r.calibrationScore).toBeNull();
    });

    it('sorts the most-diverged risk first', () => {
        const r = computeLossCalibration(
            [F('small', 100, 200), F('big', 100, 200)],
            [A('small', 250), A('big', 2000)],
        );
        expect(r.rows[0].riskId).toBe('big');
    });

    it('sums multiple actuals for the same risk', () => {
        const r = computeLossCalibration([F('a', 100, 200)], [A('a', 120), A('a', 120)]);
        expect(r.rows[0].actual).toBe(240);
        expect(r.rows[0].status).toBe('under_forecast');
    });

    it('annualizes the cumulative actual against the observed-year window', () => {
        // A risk with $1000 cumulative over a 5-year window is a $200/yr
        // annual actual — WITHIN the annual [100, 200] band, not the
        // spurious under_forecast a raw $1000-vs-$200 comparison gives.
        const withYears = computeLossCalibration([F('a', 100, 200)], [A('a', 1000)], 5);
        expect(withYears.rows[0].actual).toBe(200);
        expect(withYears.rows[0].status).toBe('within_band');
        expect(withYears.underForecast).toBe(0);

        // Same inputs treated as a single year (default) DO flag under.
        const oneYear = computeLossCalibration([F('a', 100, 200)], [A('a', 1000)]);
        expect(oneYear.rows[0].status).toBe('under_forecast');
    });

    it('removes the systematic multi-year under-forecast bias', () => {
        // Every risk lost exactly its annual P50 each year for 4 years →
        // cumulative = 4×p50, which raw-compares as under_forecast for all,
        // but annualizes back to p50 → all within band, ~100% coverage.
        const forecasts = Array.from({ length: 5 }, (_, i) => F(`r${i}`, 100, 200));
        const actuals = Array.from({ length: 5 }, (_, i) => A(`r${i}`, 400)); // 4yr × 100
        const r = computeLossCalibration(forecasts, actuals, 4);
        expect(r.underForecast).toBe(0);
        expect(r.withinBand).toBe(5);
        expect(r.coverageWithinP90).toBe(1);
    });

    it('excludes degenerate (mean-only) bands as insufficient distribution', () => {
        // p90 <= p50 is a mean-only sim (no tail data). It must NOT be
        // scored (a zero-width band flags every actual); it counts as
        // insufficientDistribution instead.
        const r = computeLossCalibration(
            [F('flat', 150, 150), F('real', 100, 200)],
            [A('flat', 150), A('real', 150)],
        );
        expect(r.insufficientDistribution).toBe(1);
        expect(r.scored).toBe(1);
        expect(r.rows.map((x) => x.riskId)).toEqual(['real']);
    });
});
