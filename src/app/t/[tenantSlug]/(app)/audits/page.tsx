import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAudits } from '@/app-layer/usecases/audit';
import { AuditsClient } from './AuditsClient';

export const dynamic = 'force-dynamic';

// SSR fetch is capped at SSR_PAGE_LIMIT rows so the initial HTML
// payload + DB query stay bounded as tenants accumulate audits.
// The Epic 69 SWR client immediately fetches the unbounded list
// in the background and keepPreviousData swaps it in transparently.
// Mirrors the PR #146 / #149 pattern.
const SSR_PAGE_LIMIT = 100;

/**
 * Audits — Server Component wrapper.
 * Fetches audits list server-side, delegates interactive master/detail to client island.
 */
export default async function AuditsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('audits'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);
    const audits = await listAudits(ctx, { take: SSR_PAGE_LIMIT });

    return (
        <div className="space-y-section animate-fadeIn">
            <AuditsClient
                initialAudits={JSON.parse(JSON.stringify(audits))}
                tenantSlug={tenantSlug}
                translations={{
                    title: t('title'),
                    auditsCount: t('auditsCount', { count: audits.length }),
                    newAudit: t('newAudit'),
                    auditTitle: t('auditTitle'),
                    auditors: t('auditors'),
                    scope: t('scope'),
                    createAudit: t('createAudit'),
                    cancel: tc('cancel'),
                    planned: t('planned'),
                    inProgress: t('inProgress'),
                    completed: t('completed'),
                    cancelled: t('cancelled'),
                    notTested: t('notTested'),
                    pass: t('pass'),
                    fail: t('fail'),
                    checklist: t('checklist'),
                    findingsTab: t('findingsTab'),
                    selectAudit: t('selectAudit'),
                }}
            />
        </div>
    );
}
