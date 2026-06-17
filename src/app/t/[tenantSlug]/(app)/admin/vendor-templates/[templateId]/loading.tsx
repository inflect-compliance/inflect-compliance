import { SkeletonDetailPage } from '@/components/ui/skeleton';

/**
 * VendorTemplate detail loading skeleton — instant route-change feedback (no blank
 * screen while the server resolves the page data).
 */
export default function VendorTemplateDetailLoading() {
    return <SkeletonDetailPage />;
}
