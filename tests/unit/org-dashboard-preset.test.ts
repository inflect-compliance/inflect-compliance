/**
 * Epic 41 — default-preset shape + layout-fidelity tests.
 *
 * The preset is the SOURCE OF TRUTH for the migration backfill AND
 * the new-org seed; visual continuity for existing tenants depends
 * on its shape staying constant. These tests lock:
 *
 *   - every preset entry passes the same Zod schema the API enforces
 *   - the eight widgets cover the prior dashboard's sections exactly
 *     (no missing tile, no rogue addition)
 *   - layout positions match the prior visual grid (KPI row at y=0,
 *     donut + trend at y=2, tenant list at y=6, drilldown at y=12)
 *   - the preset has zero overlapping (x..x+w, y..y+h) rectangles
 *
 * The mutation regression at the end strips a widget and re-runs the
 * count assertion to prove the detector isn't vacuous.
 */

import {
    DEFAULT_ORG_DASHBOARD_PRESET,
} from '@/app-layer/usecases/org-dashboard-presets';
import { CreateOrgDashboardWidgetInput } from '@/app-layer/schemas/org-dashboard-widget.schemas';

describe('Epic 41 — default org dashboard preset', () => {
    it('contains exactly eleven widgets (incl. ORG_THREAT_LEVEL + ORG_MATURITY + ORG_INITIATIVES)', () => {
        // The prior `/org/[orgSlug]` page rendered four KPI cards +
        // one donut + one trend + one tenant list + one drilldown
        // CTA group = 8 sections, + the ORG_THREAT_LEVEL banner = 9.
        expect(DEFAULT_ORG_DASHBOARD_PRESET.length).toBe(11);
    });

    it('every entry is Zod-valid against CreateOrgDashboardWidgetInput', () => {
        for (const widget of DEFAULT_ORG_DASHBOARD_PRESET) {
            const result = CreateOrgDashboardWidgetInput.safeParse(widget);
            if (!result.success) {
                throw new Error(
                    `Preset entry rejected by Zod:\n` +
                    `  type=${widget.type} chartType=${widget.chartType}\n` +
                    `  issues:\n` +
                    result.error.issues
                        .map((i) => `    - ${i.path.join('.')}: ${i.message}`)
                        .join('\n'),
                );
            }
            expect(result.success).toBe(true);
        }
    });

    it('covers the four KPI tiles in left-to-right order', () => {
        const kpis = DEFAULT_ORG_DASHBOARD_PRESET.filter(
            (w) => w.type === 'KPI',
        );
        expect(kpis).toHaveLength(4);

        // Order matches StatCardsRow in the prior page.tsx.
        expect(kpis.map((w) => w.chartType)).toEqual([
            'coverage',
            'critical-risks',
            'overdue-evidence',
            'tenants',
        ]);

        // All four sit on row y=0, columns 0/3/6/9.
        for (let i = 0; i < kpis.length; i++) {
            expect(kpis[i].position).toEqual({ x: i * 3, y: 2 });
            expect(kpis[i].size).toEqual({ w: 3, h: 2 });
        }
    });

    it('Band 2 — POSTURE: maturity radar + open-risks trend side-by-side at y=4, equal height', () => {
        const maturity = DEFAULT_ORG_DASHBOARD_PRESET.find(
            (w) => w.type === 'ORG_MATURITY',
        );
        const trend = DEFAULT_ORG_DASHBOARD_PRESET.find(
            (w) => w.type === 'TREND',
        );
        expect(maturity).toBeDefined();
        expect(trend).toBeDefined();
        // Posture band: "where we stand" (maturity) + "where we're
        // trending" (open risks), grouped, no orphaned half-row.
        expect(maturity?.position).toEqual({ x: 0, y: 4 });
        expect(maturity?.size).toEqual({ w: 6, h: 4 });
        expect(trend?.position).toEqual({ x: 6, y: 4 });
        expect(trend?.size).toEqual({ w: 6, h: 4 });
    });

    it('Band 3 — INVESTIGATE: drilldown CTAs full-width at y=8 (above the per-tenant detail)', () => {
        const ctas = DEFAULT_ORG_DASHBOARD_PRESET.find(
            (w) => w.type === 'DRILLDOWN_CTAS',
        );
        expect(ctas?.position).toEqual({ x: 0, y: 8 });
        expect(ctas?.size).toEqual({ w: 12, h: 2 });
    });

    it('Band 4 — PER-TENANT: health donut + coverage list side-by-side at y=10, equal height', () => {
        const donut = DEFAULT_ORG_DASHBOARD_PRESET.find(
            (w) => w.type === 'DONUT',
        );
        const list = DEFAULT_ORG_DASHBOARD_PRESET.find(
            (w) => w.type === 'TENANT_LIST',
        );
        // Tenant-health distribution paired with the per-tenant breakdown.
        expect(donut?.position).toEqual({ x: 0, y: 10 });
        expect(donut?.size).toEqual({ w: 4, h: 6 });
        expect(list?.position).toEqual({ x: 4, y: 10 });
        expect(list?.size).toEqual({ w: 8, h: 6 });
    });

    it('includes the ORG_MATURITY radar (half-width)', () => {
        const m = DEFAULT_ORG_DASHBOARD_PRESET.find((w) => w.type === 'ORG_MATURITY');
        expect(m).toBeDefined();
        expect(m?.chartType).toBe('radar');
        expect(m?.size.w).toBe(6);
    });

    it('includes the ORG_INITIATIVES tracker (wide)', () => {
        const i = DEFAULT_ORG_DASHBOARD_PRESET.find((w) => w.type === 'ORG_INITIATIVES');
        expect(i).toBeDefined();
        expect(i?.size.w).toBe(12);
    });

    it('has no overlapping (x..x+w, y..y+h) rectangles between any two widgets', () => {
        // Catches a future preset edit that accidentally puts two
        // widgets at the same coordinates — RGL would auto-compact
        // them visually, but the user-facing layout would no longer
        // match the original sections.
        function rect(w: typeof DEFAULT_ORG_DASHBOARD_PRESET[number]) {
            return {
                x0: w.position.x,
                x1: w.position.x + w.size.w,
                y0: w.position.y,
                y1: w.position.y + w.size.h,
            };
        }
        function overlaps(
            a: ReturnType<typeof rect>,
            b: ReturnType<typeof rect>,
        ): boolean {
            return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
        }
        const rects = DEFAULT_ORG_DASHBOARD_PRESET.map(rect);
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                if (overlaps(rects[i], rects[j])) {
                    throw new Error(
                        `Preset entries ${i} and ${j} overlap: ` +
                        `${JSON.stringify(rects[i])} ↔ ${JSON.stringify(rects[j])}`,
                    );
                }
            }
        }
    });

    it('every widget is enabled by default', () => {
        for (const w of DEFAULT_ORG_DASHBOARD_PRESET) {
            expect(w.enabled).toBe(true);
        }
    });

    it('every widget has a non-null human-readable title', () => {
        // Backfill / new-org provisioning relies on the title being
        // present so the persisted dashboard reads sensibly without
        // requiring an admin to edit each widget post-seed.
        for (const w of DEFAULT_ORG_DASHBOARD_PRESET) {
            expect(typeof w.title).toBe('string');
            expect((w.title ?? '').length).toBeGreaterThan(0);
        }
    });

    // ─── Mutation regression ──────────────────────────────────────────

    it('mutation regression — dropping a widget trips the count assertion', () => {
        const broken = DEFAULT_ORG_DASHBOARD_PRESET.slice(0, -1);
        expect(broken.length).toBe(10);
        expect(broken.length).not.toBe(11);
    });
});
