import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAuditLogs } from '@/app-layer/usecases/auditLog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { AuditLogClient } from './AuditLogClient';

export const dynamic = 'force-dynamic';

/**
 * R13-PR10 — dedicated audit log page.
 *
 * Extracted from the admin landing's "Audit log" tab so the
 * landing page stays a pure pill-nav surface. The "Notifications"
 * pill in the admin landing is paired with an "Audit log" pill
 * that points here.
 *
 * Server component does the fetch + role-bound graceful degrade
 * (members without AUDITOR / ADMIN see an empty table rather than
 * an authorization error). The DataTable lives in the client
 * island.
 */
export default async function AuditLogPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    const [t, ctx] = await Promise.all([
        getTranslations('admin'),
        getTenantCtx({ tenantSlug }),
    ]);

    let auditLog: unknown[] = [];
    try {
        auditLog = await listAuditLogs(ctx);
    } catch {
        // User may not have AUDITOR / ADMIN role — gracefully degrade.
        auditLog = [];
    }

    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    return (
        <ListPageShell className="gap-default">
            <ListPageShell.Header>
                <PageHeader
                    back={{ smart: true }}
                    breadcrumbs={[
                        { label: t('crumb.dashboard'), href: tenantHref('/dashboard') },
                        { label: t('title'), href: tenantHref('/admin') },
                        { label: t('auditLog') },
                    ]}
                    title={t('auditLog')}
                />
            </ListPageShell.Header>

            <AuditLogClient
                auditLog={JSON.parse(JSON.stringify(auditLog))}
                translations={{
                    time: t('time'),
                    user: t('user'),
                    action: t('action'),
                    entity: t('entity'),
                    details: t('details'),
                    noEntries: t('noEntries'),
                }}
            />
        </ListPageShell>
    );
}
