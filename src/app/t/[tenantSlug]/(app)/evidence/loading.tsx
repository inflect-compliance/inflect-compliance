import {
    SkeletonPageHeader,
    SkeletonFilterToolbar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Evidence loading skeleton — header + filter toolbar + 7-col table.
 */
export default function EvidenceLoading() {
    return (
        <div className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading evidence">
            <SkeletonPageHeader />
            <SkeletonFilterToolbar />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
