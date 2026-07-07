/**
 * Banded loading skeleton for the org Portfolio Overview.
 *
 * Mirrors the 4-band information architecture of
 * `DEFAULT_ORG_DASHBOARD_PRESET` (glance → posture → investigate →
 * per-tenant) at the RIGHT sizes, so the transition from skeleton to
 * rendered dashboard is a fade, not a layout shift. The org overview
 * page is server-rendered (a `Promise.all` of portfolio reads); this
 * is wired as the segment's Next `loading.tsx` so the banded shape
 * shows while that data resolves.
 *
 * Uses the shared `<Skeleton>` primitive + the semantic spacing scale
 * (`space-y-section` between bands, `gap-default` within) — never an
 * ad-hoc spinner or raw numeric gap.
 */
import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonHeading, SkeletonLine } from '@/components/ui/skeleton';

function Tile({ className = '' }: { className?: string }) {
    // Borderless on purpose — a skeleton is a fill, not a bordered card,
    // and adding a `border-border-default` here would push the down-only
    // border-tone budget. The rounded grey block reads as a loading tile.
    return <Skeleton className={`rounded-lg ${className}`} />;
}

export async function DashboardSkeleton() {
    const t = await getTranslations('org');
    return (
        <div
            className="space-y-section"
            data-testid="org-dashboard-skeleton"
            aria-busy="true"
            aria-label={t('dashboard.loadingAria')}
        >
            {/* Header — title + dashboard-level refresh meta line. */}
            <div className="space-y-tight">
                <SkeletonHeading className="w-56" />
                <SkeletonLine className="w-72" />
            </div>

            {/* Context banner. */}
            <Tile className="h-16 w-full" />

            {/* Band 1 — GLANCE: four equal KPI tiles. */}
            <div className="grid grid-cols-2 gap-default md:grid-cols-4">
                <Tile className="h-24" />
                <Tile className="h-24" />
                <Tile className="h-24" />
                <Tile className="h-24" />
            </div>

            {/* Band 2 — POSTURE: maturity radar + trend, equal height. */}
            <div className="grid grid-cols-1 gap-default md:grid-cols-2">
                <Tile className="h-64" />
                <Tile className="h-64" />
            </div>

            {/* Band 3 — INVESTIGATE: drill-down CTAs, full width. */}
            <Tile className="h-20 w-full" />

            {/* Band 4 — PER-TENANT: health donut + coverage list. */}
            <div className="grid grid-cols-1 gap-default md:grid-cols-3">
                <Tile className="h-80 md:col-span-1" />
                <Tile className="h-80 md:col-span-2" />
            </div>
        </div>
    );
}
