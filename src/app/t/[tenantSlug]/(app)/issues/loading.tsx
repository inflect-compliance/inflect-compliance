import {
    SkeletonPageHeader,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Issues loading skeleton — header + table.
 */
export default function IssuesLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading issues">
            <SkeletonPageHeader />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
