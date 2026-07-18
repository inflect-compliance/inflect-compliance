import { Skeleton, SkeletonKpiGrid } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

/**
 * Loading skeleton for the executive dashboard — mirrors the SHIPPED
 * layout so the route-level `loading.tsx` streams a shell that matches
 * what renders: posture hero → 6-card KPI grid → coverage + risk-
 * distribution → evidence + alerts → task + policy donuts → exception
 * + treatment-plan health → risk heatmap + expiry calendar → trend
 * section → next-best-action + recent activity.
 *
 * A dashboard-SPECIFIC component (not the shared `SkeletonDashboard`,
 * which still reflects the retired quick-actions/clause-bar layout and
 * backs the other risks/controls/vendors dashboard pages).
 */
function DonutCardSkeleton() {
    return (
        <Card className="h-full">
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="grid grid-cols-2 gap-default items-center">
                <Skeleton className="size-[130px] rounded-full mx-auto" />
                <div className="space-y-tight w-full">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-3 w-full" />
                    ))}
                </div>
            </div>
        </Card>
    );
}

function ListCardSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <Card className="h-full">
            <Skeleton className="h-4 w-40 mb-4" />
            <div className="space-y-tight">
                {Array.from({ length: rows }).map((_, i) => (
                    <Skeleton key={i} className="h-3 w-full" />
                ))}
            </div>
        </Card>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="space-y-section" aria-hidden="true">
            {/* Page header */}
            <div className="space-y-2">
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>

            {/* Posture hero */}
            <Card className="min-h-[140px]">
                <Skeleton className="h-3 w-32 mb-3" />
                <Skeleton className="h-10 w-2/3 mb-3" />
                <Skeleton className="h-4 w-full max-w-xl" />
            </Card>

            {/* KPI grid (6 cards) */}
            <SkeletonKpiGrid count={6} />

            {/* Control coverage + risk distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <ListCardSkeleton rows={3} />
                <DonutCardSkeleton />
            </div>

            {/* Evidence status + compliance alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <ListCardSkeleton />
                <ListCardSkeleton />
            </div>

            {/* Task status + policy status donuts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <DonutCardSkeleton />
                <DonutCardSkeleton />
            </div>

            {/* Exception inventory + treatment-plan status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <ListCardSkeleton />
                <ListCardSkeleton />
            </div>

            {/* Risk heatmap + evidence expiry calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <Skeleton className="h-[280px] w-full rounded-lg" />
                <Skeleton className="h-[240px] w-full rounded-lg" />
            </div>

            {/* Trend section */}
            <Card>
                <Skeleton className="h-4 w-40 mb-4" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-default">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
            </Card>

            {/* Next best action + recent activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-default">
                <ListCardSkeleton rows={3} />
                <ListCardSkeleton />
            </div>
        </div>
    );
}

export default DashboardSkeleton;
