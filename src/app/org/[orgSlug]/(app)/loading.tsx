/**
 * Route-segment loading fallback for the org Portfolio Overview.
 *
 * The overview page (`page.tsx`) server-renders a `Promise.all` of
 * portfolio reads; Next shows this banded skeleton while that resolves
 * — skeletons at the right sizes, no layout shift. It is the nearest
 * `loading.tsx` for the org `(app)` segment; a sub-route that wants a
 * different shape adds its own `loading.tsx` (nearest wins).
 */
import { DashboardSkeleton } from './DashboardSkeleton';

export default function OrgDashboardLoading() {
    return <DashboardSkeleton />;
}
