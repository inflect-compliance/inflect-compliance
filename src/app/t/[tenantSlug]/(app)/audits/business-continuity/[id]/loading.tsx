import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/** BIA detail loading skeleton — back link + heading + meta + section cards. */
export default function BiaDetailLoading() {
    return <SkeletonDetailTabs tabCount={0} />;
}
