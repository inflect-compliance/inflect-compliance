import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Tasks loading skeleton — header + filters + 8-col table.
 */
export default function TasksLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading tasks">
            <SkeletonPageHeader />
            <SkeletonFilterBar />
            <SkeletonDataTable rows={10} cols={8} />
        </div>
    );
}
