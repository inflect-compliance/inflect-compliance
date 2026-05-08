import {
    SkeletonPageHeader,
    SkeletonFilterToolbar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Vendors loading skeleton — header + filter toolbar + 7-col table.
 */
export default function VendorsLoading() {
    return (
        <div className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading vendors">
            <SkeletonPageHeader />
            <SkeletonFilterToolbar />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
