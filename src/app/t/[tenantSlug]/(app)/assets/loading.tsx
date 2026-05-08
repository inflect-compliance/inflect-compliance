import {
    SkeletonPageHeader,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Assets loading skeleton — header + table.
 */
export default function AssetsLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading assets">
            <SkeletonPageHeader />
            <SkeletonDataTable rows={8} cols={6} />
        </div>
    );
}
