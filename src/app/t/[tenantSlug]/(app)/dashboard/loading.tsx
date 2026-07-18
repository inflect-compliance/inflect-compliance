import { DashboardSkeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading.tsx for /t/[tenantSlug]/dashboard.
 *
 * Mirrors the shipped executive-dashboard layout — posture hero, 6-card
 * KPI grid, donut rows, exception/treatment health cards, risk heatmap,
 * expiry calendar, and trend section — so the streamed shell matches the
 * real page rather than the retired quick-actions/clause-bar layout.
 */
export default function DashboardLoading() {
    return <DashboardSkeleton />;
}
