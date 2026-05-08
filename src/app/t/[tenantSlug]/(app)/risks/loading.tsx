import {
    SkeletonPageHeader,
    SkeletonKpiGrid,
    SkeletonFilterToolbar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Risks loading skeleton — header + 4 KPI cards + filter toolbar + 8-col table.
 * Matches the real RisksClient layout for seamless streaming.
 */
export default function RisksLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading risks">
            <SkeletonPageHeader />
            <SkeletonKpiGrid count={4} />
            <SkeletonFilterToolbar />
            <SkeletonDataTable rows={8} cols={8} />
        </div>
    );
}
