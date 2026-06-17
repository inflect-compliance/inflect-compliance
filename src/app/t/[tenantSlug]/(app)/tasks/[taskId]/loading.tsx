import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Task detail loading skeleton — instant route-change feedback (no blank
 * screen while the server resolves the page data). Matches the tabbed
 * detail layout so it streams without reflow.
 */
export default function TaskDetailLoading() {
    return <SkeletonDetailTabs tabCount={4} />;
}
