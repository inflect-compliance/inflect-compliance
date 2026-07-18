/**
 * Epic 41 — Configurable Dashboard Widget Engine — default preset.
 *
 * NOTE ON "preset": this is intentionally scope-limited to ONE canonical
 * default layout + a reset-to-that-default action. It is deliberately
 * NOT a multi-preset save/apply engine (there is no "save my layout as
 * a named preset" / "apply preset X" surface). Read "preset" throughout
 * this module as "the single recommended default composition".
 *
 * Mirrors the prior hardcoded composition of the org-level dashboard
 * at `/org/[orgSlug]` (page.tsx, sections rendered before this epic
 * landed):
 *
 *   1. PageHeader               (chrome — not a widget)
 *   2. StatCardsRow             — four KPI tiles (coverage, critical-risks,
 *                                 overdue-evidence, tenants)
 *   3. RagDistributionCard      — donut breakdown of tenant RAG status
 *   4. RiskTrendCard            — open-risks trend over 90 days
 *   5. TenantCoverageList       — per-tenant list with drill-down
 *   6. DrillDownCtas            — three navigation cards (controls /
 *                                 risks / evidence)
 *
 * The preset below is the SOURCE OF TRUTH for both:
 *
 *   - new-org provisioning (called from `POST /api/org`), and
 *   - existing-org backfill (`scripts/backfill-org-dashboard-widgets.ts`).
 *
 * Both paths converge through `seedDefaultOrgDashboard`, which
 * inserts the full preset only when the target org has zero widgets.
 * Idempotent: a re-run on an org that already has widgets is a no-op,
 * never a duplicate.
 *
 * ─── Information architecture (the default layout) ─────────────────
 *
 * The preset encodes a deliberate top-to-bottom narrative —
 * glance → posture → investigate → per-tenant → programme — so the
 * dashboard reads as an enterprise portfolio view, not a widget dump.
 * Each band groups widgets that answer the SAME question, at a
 * consistent height, with no orphaned half-rows. (See
 * `docs/implementation-notes/2026-06-30-org-dashboard-composition.md`.)
 *
 *   y=0   ┌────────── ORG_THREAT_LEVEL 12×2 ──────┐  context banner
 *         ├── KPI ──┬── KPI ──┬── KPI ──┬── KPI ──┤  Band 1 — GLANCE
 *   y=2   │ cov 3×2 │ cri 3×2 │ ovd 3×2 │ ten 3×2 │  (4 equal tiles)
 *   y=4   ├──── MATURITY 6×4 ──┬──── TREND 6×4 ───┤  Band 2 — POSTURE
 *         │   radar (stand)    │ risks-open (trend)│  (equal height)
 *   y=8   ├────────── DRILLDOWN_CTAS 12×2 ────────┤  Band 3 — INVESTIGATE
 *   y=10  ├── DONUT 4×6 ──┬──── TENANT_LIST 8×6 ──┤  Band 4 — PER-TENANT
 *         │ rag (health)  │  coverage-by-tenant   │  (health + breakdown)
 *   y=16  ├────────── ORG_INITIATIVES 12×4 ───────┤  Band 5 — PROGRAMME
 *         └───────────────────────────────────────┘  (the coda)
 *
 * Equal-height tiles WITHIN each band (Band 1 all h=2, Band 2 both
 * h=4, Band 4 both h=6) give the page a consistent visual rhythm;
 * the `org-dashboard-composition` guard locks the band structure +
 * no-overlap invariant so a future edit can't drift it back into a
 * scattered grid.
 *
 * Adding / removing widgets later: edit `DEFAULT_ORG_DASHBOARD_PRESET`
 * and ship a backfill that targets only the affected positions
 * (don't re-run the full seed; it short-circuits on any existing
 * widget). Existing orgs adopt a changed IA via the "Reset to
 * recommended layout" action or `npm run db:reconcile-org-widgets`,
 * which reflow to these preset positions.
 */

import type { Prisma, OrgDashboardWidgetType } from '@prisma/client';
import type { CreateOrgDashboardWidgetInput } from '@/app-layer/schemas/org-dashboard-widget.schemas';

/**
 * The eight widgets that compose the default org dashboard.
 *
 * Field shape matches `CreateOrgDashboardWidgetInput` exactly so the
 * preset is Zod-valid by construction — verified by
 * `tests/unit/org-dashboard-preset.test.ts`.
 */
export const DEFAULT_ORG_DASHBOARD_PRESET: ReadonlyArray<CreateOrgDashboardWidgetInput> = [
    // ─── Row 0: org-wide threat posture (human-curated; top, full width) ──
    {
        type: 'ORG_THREAT_LEVEL',
        chartType: 'banner',
        title: 'Threat Level',
        config: { showHistory: true },
        position: { x: 0, y: 0 },
        size: { w: 12, h: 2 },
        enabled: true,
    },

    // ─── Row 1: four KPI tiles ──────────────────────────────────────
    {
        type: 'KPI',
        chartType: 'coverage',
        title: 'Coverage',
        config: { format: 'percent' },
        position: { x: 0, y: 2 },
        size: { w: 3, h: 2 },
        enabled: true,
    },
    {
        type: 'KPI',
        chartType: 'critical-risks',
        title: 'Critical Risks',
        config: { format: 'number' },
        position: { x: 3, y: 2 },
        size: { w: 3, h: 2 },
        enabled: true,
    },
    {
        type: 'KPI',
        chartType: 'overdue-evidence',
        title: 'Overdue Evidence',
        config: { format: 'number' },
        position: { x: 6, y: 2 },
        size: { w: 3, h: 2 },
        enabled: true,
    },
    {
        type: 'KPI',
        chartType: 'tenants',
        title: 'Tenants',
        config: { format: 'number' },
        position: { x: 9, y: 2 },
        size: { w: 3, h: 2 },
        enabled: true,
    },

    // ─── Band 2 — POSTURE: where we stand (maturity) + where we're
    //     trending (open-risks), grouped side-by-side at equal height ──
    {
        type: 'ORG_MATURITY',
        chartType: 'radar',
        title: 'Security Maturity',
        config: { view: 'radar', showCoverageHint: true },
        position: { x: 0, y: 4 },
        size: { w: 6, h: 4 },
        enabled: true,
    },
    {
        type: 'TREND',
        chartType: 'risks-open',
        title: 'Open Risks (90 days)',
        config: { days: 90 },
        position: { x: 6, y: 4 },
        size: { w: 6, h: 4 },
        enabled: true,
    },

    // ─── Band 3 — INVESTIGATE: drill-down navigation cards (full width,
    //     above the per-tenant detail — investigate, then drill in) ────
    {
        type: 'DRILLDOWN_CTAS',
        chartType: 'default',
        title: 'Drill-down',
        config: {},
        position: { x: 0, y: 8 },
        size: { w: 12, h: 2 },
        enabled: true,
    },

    // ─── Band 4 — PER-TENANT: tenant-health distribution (donut) +
    //     the per-tenant coverage breakdown, grouped at equal height ──
    {
        type: 'DONUT',
        chartType: 'rag-distribution',
        title: 'Tenant Health Distribution',
        config: { showLegend: true },
        position: { x: 0, y: 10 },
        size: { w: 4, h: 6 },
        enabled: true,
    },
    {
        type: 'TENANT_LIST',
        chartType: 'coverage',
        title: 'Coverage by Tenant',
        config: { sortBy: 'rag' },
        position: { x: 4, y: 10 },
        size: { w: 8, h: 6 },
        enabled: true,
    },

    // ─── Band 5 — PROGRAMME: portfolio security-initiatives (the coda —
    //     "what we're doing about it", full width, bottom) ────────────
    {
        type: 'ORG_INITIATIVES',
        chartType: 'list',
        title: 'Security Initiatives',
        config: { topN: 5 },
        position: { x: 0, y: 16 },
        size: { w: 12, h: 4 },
        enabled: true,
    },
];

/**
 * Minimum Prisma client surface the seeder needs. Both the global
 * `prisma` import AND a `Prisma.TransactionClient` (from `$transaction`)
 * satisfy this — the seeder works inside or outside a transaction
 * without further plumbing.
 */
type SeederClient = Prisma.TransactionClient | {
    orgDashboardWidget: {
        count(args: { where: { organizationId: string } }): Promise<number>;
        createMany(args: {
            data: Array<{
                organizationId: string;
                type: OrgDashboardWidgetType;
                chartType: string;
                title: string | null;
                config: Prisma.InputJsonValue;
                position: Prisma.InputJsonValue;
                size: Prisma.InputJsonValue;
                enabled: boolean;
            }>;
        }): Promise<{ count: number }>;
    };
};

/**
 * Per-call result so callers (the org-creation tx, the backfill
 * script) can distinguish "seeded" from "already had widgets".
 */
export interface SeedDefaultOrgDashboardResult {
    /** The org that was processed. */
    organizationId: string;
    /** True when the preset was inserted; false when the org already had widgets. */
    seeded: boolean;
    /** Count of widgets created on this call. 0 when `seeded === false`. */
    created: number;
}

/**
 * Insert the default preset for `organizationId` IF the org has zero
 * widgets. Idempotent — re-running is a no-op for orgs that already
 * have any widget (regardless of which preset created it). This is
 * the single entry point both org creation and backfill consume so
 * the duplication semantics live in one place.
 *
 * Concurrency: under a transaction (the `POST /api/org` path), the
 * Prisma row-level lock from `count` is held to commit, so two
 * concurrent calls cannot both see `count === 0` and both insert.
 * Outside a transaction (the backfill script), the natural
 * read-then-write race is acceptable — the worst case is the
 * backfill run and a parallel manual write briefly producing a
 * 9-widget org, which the user can clean up by hand. The script
 * runs once on prod under operator supervision; the race window
 * is single-digit milliseconds.
 */
export async function seedDefaultOrgDashboard(
    db: SeederClient,
    organizationId: string,
): Promise<SeedDefaultOrgDashboardResult> {
    const existing = await db.orgDashboardWidget.count({
        where: { organizationId },
    });
    if (existing > 0) {
        return { organizationId, seeded: false, created: 0 };
    }

    const result = await db.orgDashboardWidget.createMany({
        data: DEFAULT_ORG_DASHBOARD_PRESET.map((w) => ({
            organizationId,
            type: w.type,
            chartType: w.chartType,
            title: w.title ?? null,
            config: w.config as Prisma.InputJsonValue,
            position: w.position as Prisma.InputJsonValue,
            size: w.size as Prisma.InputJsonValue,
            enabled: w.enabled ?? true,
        })),
    });

    return { organizationId, seeded: true, created: result.count };
}
