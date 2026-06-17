/**
 * Canonical KPI-trends helpers — buildKpiSparklines + centeredSparklineDomain.
 *
 * The shared pipeline behind every entity's KPI-card sparklines. Locks the
 * truthful-history contract: the leading defaulted-zero prefix is trimmed
 * (gated on the entity total), every per-card series stays date-aligned, and
 * the centered domain keeps a row of sparklines on one vertical level.
 */
import {
    buildKpiSparklines,
    centeredSparklineDomain,
} from '@/lib/charts/kpi-trends';
import type { TrendDataPoint } from '@/app-layer/usecases/compliance-trends';

// Minimal trend points — only the fields the pickers read matter.
const pt = (date: string, total: number, open: number): TrendDataPoint =>
    ({ date, risksTotal: total, risksOpen: open }) as unknown as TrendDataPoint;

describe('buildKpiSparklines', () => {
    it('trims the leading all-zero (pre-existence) prefix, gated on the anchor', () => {
        const points = [
            pt('2026-06-01', 0, 0), // false history (column defaulted 0)
            pt('2026-06-02', 0, 0),
            pt('2026-06-03', 5, 3), // real data starts here
            pt('2026-06-04', 6, 2),
        ];
        const out = buildKpiSparklines(points, (d) => d.risksTotal, {
            total: (d) => d.risksTotal,
            open: (d) => d.risksOpen,
        });
        expect(out.total).toHaveLength(2);
        expect(out.total.map((p) => p.value)).toEqual([5, 6]);
        // Every series is sliced at the SAME index → stays date-aligned.
        expect(out.open).toHaveLength(2);
        expect(out.open.map((p) => p.value)).toEqual([3, 2]);
        expect(out.total[0].date).toEqual(new Date('2026-06-03'));
    });

    it('returns empty series when the anchor is never > 0', () => {
        const points = [pt('2026-06-01', 0, 0), pt('2026-06-02', 0, 0)];
        const out = buildKpiSparklines(points, (d) => d.risksTotal, {
            total: (d) => d.risksTotal,
        });
        expect(out.total).toEqual([]);
    });

    it('handles undefined / empty input without throwing', () => {
        expect(
            buildKpiSparklines(undefined, (d) => d.risksTotal, {
                total: (d) => d.risksTotal,
            }).total,
        ).toEqual([]);
    });

    it('keeps a real series intact when data starts at index 0', () => {
        const points = [pt('2026-06-01', 4, 1), pt('2026-06-02', 4, 1)];
        const out = buildKpiSparklines(points, (d) => d.risksTotal, {
            total: (d) => d.risksTotal,
        });
        expect(out.total).toHaveLength(2);
    });
});

describe('centeredSparklineDomain', () => {
    it('pads the range so the data midpoint sits centred', () => {
        // values 10..14 → [min-pad, max+pad] with pad = (14-10)*0.5 = 2
        expect(
            centeredSparklineDomain([{ value: 10 }, { value: 14 }, { value: 12 }]),
        ).toEqual([8, 16]);
    });
    it('returns undefined for a constant series (chart auto-centres)', () => {
        expect(centeredSparklineDomain([{ value: 3 }, { value: 3 }])).toBeUndefined();
    });
    it('returns undefined for empty/undefined', () => {
        expect(centeredSparklineDomain([])).toBeUndefined();
        expect(centeredSparklineDomain(undefined)).toBeUndefined();
    });
});
