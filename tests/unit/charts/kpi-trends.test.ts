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
    buildKpiSparklineNullable,
    centeredSparklineDomain,
    assignSparklineVariants,
    SPARKLINE_VARIANTS,
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

// Minimal points carrying a nullable bucket column (forward-only).
const ptN = (date: string, draft: number | null): TrendDataPoint =>
    ({ date, evidenceDraft: draft }) as unknown as TrendDataPoint;

describe('buildKpiSparklineNullable', () => {
    it('trims the leading NULL prefix (pre-existence rows) and keeps the rest', () => {
        const points = [
            ptN('2026-06-01', null), // before the column existed
            ptN('2026-06-02', null),
            ptN('2026-06-03', 0), // real 0 — kept (distinct from "no data")
            ptN('2026-06-04', 5),
        ];
        const out = buildKpiSparklineNullable(points, (d) => d.evidenceDraft);
        expect(out).toHaveLength(2);
        expect(out.map((p) => p.value)).toEqual([0, 5]);
        expect(out[0].date).toEqual(new Date('2026-06-03'));
    });

    it('returns empty while every point is NULL (no data yet → no sparkline)', () => {
        const points = [ptN('2026-06-01', null), ptN('2026-06-02', null)];
        expect(buildKpiSparklineNullable(points, (d) => d.evidenceDraft)).toEqual([]);
    });

    it('handles undefined input', () => {
        expect(buildKpiSparklineNullable(undefined, (d) => d.evidenceDraft)).toEqual([]);
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

describe('assignSparklineVariants', () => {
    // A deterministic rng makes the assignment reproducible in tests; the
    // distinctness invariant must hold for ANY rng (see the random sweep).
    const seededRng = (seed: number) => {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    };

    it('assigns every card a distinct colour (≤ palette size)', () => {
        const keys = ['total', 'active', 'paused', 'archived'] as const;
        const out = assignSparklineVariants(keys, seededRng(1));
        const colours = keys.map((k) => out[k]);
        expect(new Set(colours).size).toBe(keys.length); // no repeats
        // every key got a real palette colour
        colours.forEach((c) => expect(SPARKLINE_VARIANTS).toContain(c));
    });

    it('is deterministic for a fixed rng', () => {
        const keys = ['a', 'b', 'c'] as const;
        expect(assignSparklineVariants(keys, seededRng(42))).toEqual(
            assignSparklineVariants(keys, seededRng(42)),
        );
    });

    it('never repeats a colour for 2..6 cards across many random shuffles', () => {
        for (let trial = 0; trial < 500; trial++) {
            const rng = seededRng(trial + 1);
            for (let n = 2; n <= SPARKLINE_VARIANTS.length; n++) {
                const keys = Array.from({ length: n }, (_, i) => `k${i}`);
                const out = assignSparklineVariants(keys, rng);
                const colours = keys.map((k) => out[k]);
                expect(new Set(colours).size).toBe(n);
            }
        }
    });

    it('only wraps (allows a repeat) once keys exceed the palette', () => {
        const keys = Array.from({ length: 8 }, (_, i) => `k${i}`);
        const out = assignSparklineVariants(keys, seededRng(7));
        // 8 keys, 6 colours → exactly 6 distinct, the last 2 wrap.
        expect(new Set(keys.map((k) => out[k])).size).toBe(SPARKLINE_VARIANTS.length);
    });
});
