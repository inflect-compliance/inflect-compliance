import {
    SkeletonPageHeader,
    SkeletonDataTable,
    SkeletonCard,
} from '@/components/ui/skeleton';

/**
 * Audits loading skeleton — header + cycles/packs list.
 */
export default function AuditsLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading audits">
            <SkeletonPageHeader />

            {/* Cycles section */}
            <SkeletonCard lines={2} />

            {/* Packs table */}
            <SkeletonDataTable rows={6} cols={6} />
        </div>
    );
}
