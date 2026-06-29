import { getTenantCtx } from '@/app-layer/context';
import { getTrustCenter } from '@/app-layer/usecases/trust-center';
import { TrustCenterAdminClient } from './TrustCenterAdminClient';

export const dynamic = 'force-dynamic';

/**
 * Trust Center admin (compose) — Server Component. Authenticated + admin-gated.
 * Loads the curated row and passes the OWNER publish-capability flag so the
 * client only shows the publish toggle to OWNERs.
 */
export default async function TrustCenterAdminPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const trustCenter = await getTrustCenter(ctx);

    return (
        <TrustCenterAdminClient
            tenantSlug={resolved.tenantSlug}
            initial={trustCenter ? JSON.parse(JSON.stringify(trustCenter)) : null}
            canPublish={Boolean(ctx.appPermissions?.admin?.tenant_lifecycle)}
        />
    );
}
