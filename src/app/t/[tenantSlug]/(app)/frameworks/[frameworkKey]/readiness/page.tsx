import { getTranslations } from 'next-intl/server';

import { getTenantCtx } from '@/app-layer/context';
import { Nis2ReadinessClient } from './Nis2ReadinessClient';

export const dynamic = 'force-dynamic';

/**
 * NIS2 readiness results view — score, prioritized gaps, trend, and the
 * explicit "create findings + tasks" action. NIS2 only. This is a
 * self-assessment maturity aid, NOT a legal compliance determination.
 */
export default async function FrameworkReadinessPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; frameworkKey: string }>;
}) {
    const { tenantSlug, frameworkKey } = await params;
    await getTenantCtx({ tenantSlug });

    if (frameworkKey.toUpperCase() !== 'NIS2') {
        const t = await getTranslations('frameworks');
        return (
            <div className="p-6">
                <p className="text-content-muted text-sm">
                    {t('readiness.onlyNis2')}
                </p>
            </div>
        );
    }
    return <Nis2ReadinessClient tenantSlug={tenantSlug} />;
}
