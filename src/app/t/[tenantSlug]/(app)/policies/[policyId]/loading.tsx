import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Policy detail loading skeleton — back link + heading + pills + tabs + content
 * cards. Six always-visible tabs (Current, Versions, Mappings, Traceability,
 * Acknowledgements, Activity); the Editor tab is write-gated.
 */
export default function PolicyDetailLoading() {
    return <SkeletonDetailTabs tabCount={6} />;
}
