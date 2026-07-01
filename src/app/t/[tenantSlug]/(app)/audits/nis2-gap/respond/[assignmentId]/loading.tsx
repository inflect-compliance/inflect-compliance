import { SkeletonPageHeader, SkeletonCard } from '@/components/ui/skeleton';

/** NIS2 gap-assessment respond page loading skeleton — header + question cards. */
export default function Nis2RespondLoading() {
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label="Loading your NIS2 questions">
            <SkeletonPageHeader />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
        </div>
    );
}
