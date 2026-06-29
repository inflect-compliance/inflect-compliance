import { SkeletonDetailTabs } from '@/components/ui/skeleton';

/**
 * Incident detail loading skeleton — back link + heading + pills + tabs +
 * content cards. Renders instantly so navigating to an incident never
 * shows a blank screen while the detail payload resolves.
 */
export default function IncidentDetailLoading() {
    return <SkeletonDetailTabs tabCount={3} />;
}
