import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listPolicies } from '@/app-layer/usecases/policy';
import { PoliciesClient } from './PoliciesClient';

export const dynamic = 'force-dynamic';

// SSR fetch is capped at SSR_PAGE_LIMIT rows so the initial HTML
// payload + DB query stay bounded as tenants accumulate policies.
// The Epic 69 SWR client immediately fetches the unbounded list
// in the background and keepPreviousData swaps it in transparently.
// Mirrors the PR #146 / #149 pattern.
const SSR_PAGE_LIMIT = 100;

/**
 * Policies — Server Component.
 * Fetches policy list server-side (with URL filters applied),
 * delegates interaction to client island.
 */
export default async function PoliciesPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;

    // Translation and tenant context are independent — fetch in parallel
    const [t, ctx] = await Promise.all([
        getTranslations('policies'),
        getTenantCtx({ tenantSlug }),
    ]);

    // Build filters from searchParams for server-side data fetch
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'category']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const policies = await listPolicies(
        ctx,
        Object.keys(filters).length > 0 ? filters : undefined,
        { take: SSR_PAGE_LIMIT },
    );

    return (
        <PoliciesClient
            initialPolicies={JSON.parse(JSON.stringify(policies))}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            translations={{
                title: t('title'),
                listDescription: t('listDescription'),
            }}
        />
    );
}
