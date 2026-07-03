import { SkeletonDetailPage } from '@/components/ui/skeleton';

/**
 * AI system detail loading skeleton — back link + heading + classification /
 * obligations cards. Matches the (non-tabbed) detail layout for seamless
 * streaming.
 */
export default function AiSystemDetailLoading() {
    return <SkeletonDetailPage />;
}
