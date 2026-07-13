'use client';

/**
 * P1 — synced-identity roster. Gives ConnectedIdentityAccount a browse surface
 * (like Personnel / Devices) so an Okta / Google Workspace directory sync
 * produces something visible, and a CONNECTED_APP access review can be
 * pre-checked instead of throwing "zero subjects" on empty.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@/lib/format-date';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { DataTable, createColumns } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { InlineNotice } from '@/components/ui/inline-notice';

interface AccountRow {
    id: string;
    provider: string;
    email: string | null;
    displayName: string | null;
    status: string;
    isAdmin: boolean;
    mfaEnrolled: boolean;
    lastActiveAt: string | null;
    syncedAt: string | null;
}

export default function IdentityAccountsPage() {
    const t = useTranslations('admin');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const [rows, setRows] = useState<AccountRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setError(false);
        try {
            const res = await fetch(apiUrl('/admin/integrations/identity-accounts'));
            if (!res.ok) { setError(true); return; }
            setRows((await res.json()).accounts ?? []);
        } catch {
            setError(true);
        } finally {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(false);
        }
    }, [apiUrl]);
    useEffect(() => { void load(); }, [load]);

    const cols = createColumns<AccountRow>([
        { accessorKey: 'provider', header: t('integrations.colProvider'), cell: ({ getValue }) => <StatusBadge variant="info">{getValue()}</StatusBadge> },
        { accessorKey: 'email', header: t('identityAccounts.colEmail'), cell: ({ row }) => <span className="font-medium">{row.original.email ?? row.original.displayName ?? '—'}</span> },
        { id: 'name', accessorKey: 'displayName', header: t('identityAccounts.colName'), cell: ({ getValue }) => <span className="text-content-muted">{String(getValue() ?? '—')}</span> },
        { id: 'status', accessorKey: 'status', header: t('integrations.colStatus'), cell: ({ row }) => <StatusBadge variant={row.original.status === 'ACTIVE' ? 'success' : 'neutral'}>{row.original.status}</StatusBadge> },
        { id: 'admin', accessorKey: 'isAdmin', header: t('identityAccounts.colAdmin'), cell: ({ row }) => row.original.isAdmin ? <StatusBadge variant="warning">{t('identityAccounts.admin')}</StatusBadge> : <span className="text-content-subtle">—</span> },
        { id: 'mfa', accessorKey: 'mfaEnrolled', header: t('identityAccounts.colMfa'), cell: ({ row }) => row.original.mfaEnrolled ? <StatusBadge variant="success">{t('identityAccounts.mfaOn')}</StatusBadge> : <StatusBadge variant="error">{t('identityAccounts.mfaOff')}</StatusBadge> },
        { id: 'synced', accessorKey: 'syncedAt', header: t('identityAccounts.colSynced'), cell: ({ row }) => <span className="text-content-muted tabular-nums">{row.original.syncedAt ? formatDate(row.original.syncedAt) : '—'}</span> },
    ]);

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('integrations.title'), href: tenantHref('/admin/integrations') }, { label: t('identityAccounts.breadcrumb') }]} />
            <Heading level={1}>{t('identityAccounts.title')}</Heading>
            <p className="text-sm text-content-muted">{t('identityAccounts.intro')}</p>

            <Card className="space-y-default p-6">
                {error ? (
                    <InlineNotice variant="error">{t('identityAccounts.loadError')}</InlineNotice>
                ) : loading ? (
                    <p className="text-sm text-content-subtle">{t('integrations.fetching')}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-content-muted">{t('identityAccounts.empty')}</p>
                ) : (
                    <DataTable data={rows} columns={cols} getRowId={(r) => r.id} emptyState={t('identityAccounts.empty')} />
                )}
            </Card>
        </div>
    );
}
