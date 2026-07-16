import { getTranslations } from 'next-intl/server';
import { Skeleton, SkeletonHeading } from '@/components/ui/skeleton';
import { cardVariants } from '@/components/ui/card';

/**
 * Reports loading skeleton (PR-G) — matches the catalog IA: header + framework
 * selector, a grid of report cards, then the on-screen readiness report block.
 */
export default async function ReportsLoading() {
    const t = await getTranslations('reports');
    return (
        <div
            className="space-y-section animate-fadeIn"
            aria-busy="true"
            aria-label={t('loadingAria')}
        >
            {/* Header + framework selector */}
            <div className="flex flex-col gap-compact">
                <div className="flex items-center justify-between gap-compact">
                    <SkeletonHeading className="w-48" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
                <div className="flex items-center gap-tight">
                    <Skeleton className="h-4 w-20 rounded" />
                    <Skeleton className="h-9 w-64 rounded-lg" />
                </div>
            </div>

            {/* Report catalog cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-default">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`${cardVariants({ density: 'comfortable' })} space-y-tight`}>
                        <Skeleton className="h-5 w-40 rounded" />
                        <Skeleton className="h-4 w-full rounded" />
                        <Skeleton className="h-8 w-28 rounded-lg" />
                    </div>
                ))}
            </div>

            {/* On-screen readiness report */}
            <div className="space-y-default">
                <SkeletonHeading className="w-64" />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-default">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={cardVariants({ density: 'none' })}>
                            <Skeleton className="h-8 w-16 rounded" />
                            <Skeleton className="h-3 w-20 rounded mt-2" />
                        </div>
                    ))}
                </div>
                <div className={cardVariants({ density: 'none' })}>
                    <Skeleton className="h-4 w-40 rounded mb-3" />
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full rounded mb-2" />
                    ))}
                </div>
            </div>
        </div>
    );
}
