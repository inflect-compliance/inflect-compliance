import { getTranslations } from 'next-intl/server';

import { getTenantCtx } from '@/app-layer/context';
import { listDsarRequests } from '@/app-layer/usecases/dsar-register';
import { DsarRegisterClient } from './DsarRegisterClient';

export const dynamic = 'force-dynamic';

/**
 * DSAR register — GDPR Art. 15 / 17 rights requests.
 *
 * This is a RECORD, not an engine. Fulfilment is manual: no export bundle is
 * produced and no data is erased by anything on this page. See
 * `usecases/dsar-register.ts` for the (load-bearing) tenant-scoping note.
 *
 * `canManage` is passed separately from read access because AUDITOR holds
 * `compliance_dsar_view` but not `_manage` — an auditor reads the register as
 * compliance evidence and never advances a request through it.
 */
export default async function AdminDsarRequestsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const requests = await listDsarRequests(ctx);
    const t = await getTranslations('admin');

    return (
        <DsarRegisterClient
            tenantSlug={resolved.tenantSlug}
            initial={JSON.parse(JSON.stringify(requests))}
            canManage={Boolean(ctx.appPermissions?.admin?.compliance_dsar_manage)}
            title={t('dsar.title')}
        />
    );
}
