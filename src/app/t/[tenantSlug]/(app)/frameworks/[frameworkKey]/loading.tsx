import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Framework detail loading skeleton — instant route-change feedback (no blank
 * screen while the server resolves the page data). Matches the tabbed
 * detail layout so it streams without reflow.
 */
export default function FrameworkDetailLoading() {
    return <SkeletonDetailTabs tabCount={4} />;
}
