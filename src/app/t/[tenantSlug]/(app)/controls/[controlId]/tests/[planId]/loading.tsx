import { SkeletonDetailPage } from '@/components/ui/skeleton';

/**
 * TestPlan detail loading skeleton — instant route-change feedback (no blank
 * screen while the server resolves the page data).
 */
export default function TestPlanDetailLoading() {
    return <SkeletonDetailPage />;
}
