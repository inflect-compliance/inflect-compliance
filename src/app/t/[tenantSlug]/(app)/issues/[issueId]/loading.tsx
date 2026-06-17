import { SkeletonDetailPage } from '@/components/ui/skeleton';

/**
 * Issue detail loading skeleton — instant route-change feedback (no blank
 * screen while the server resolves the page data).
 */
export default function IssueDetailLoading() {
    return <SkeletonDetailPage />;
}
