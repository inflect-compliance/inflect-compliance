import { getTenantCtx } from '@/app-layer/context';
import { listVendors } from '@/app-layer/usecases/vendor';
import { VendorsClient } from './VendorsClient';

export const dynamic = 'force-dynamic';

// SSR fetch is capped at SSR_PAGE_LIMIT rows so the initial HTML
// payload + DB query stay bounded as tenants accumulate vendors.
// The Epic 69 SWR client immediately fetches the unbounded list
// in the background and keepPreviousData swaps it in transparently.
// Mirrors the PR #146 / #149 pattern.
const SSR_PAGE_LIMIT = 100;

/**
 * Vendors — Server Component wrapper.
 * Fetches vendor list server-side (with URL filters applied),
 * delegates interaction to client island.
 */
export default async function VendorRegisterPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;
    const ctx = await getTenantCtx({ tenantSlug });

    // Build filters from searchParams for server-side data fetch
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'criticality', 'reviewDue']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const vendors = await listVendors(
        ctx,
        Object.keys(filters).length > 0 ? filters : undefined,
        { take: SSR_PAGE_LIMIT },
    );

    return (
        <div className="space-y-section">
            <VendorsClient
                initialVendors={JSON.parse(JSON.stringify(vendors))}
                initialFilters={filters}
                tenantSlug={tenantSlug}
                permissions={{
                    canCreate: ctx.appPermissions.vendors.create,
                }}
            />
        </div>
    );
}
