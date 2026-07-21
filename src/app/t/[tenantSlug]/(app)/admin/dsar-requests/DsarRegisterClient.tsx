'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserFocus } from '@/components/ui/icons/nucleo';

import { DataTable } from '@/components/ui/table';
import type { Column } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { formatDate } from '@/lib/format-date';
import { useTenantHref } from '@/lib/tenant-context-provider';

export interface DsarRow {
    id: string;
    type: 'EXPORT' | 'ERASURE';
    status: 'RECEIVED' | 'VERIFIED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELED';
    subject: { id: string; email: string | null; name: string | null };
    requestedAt: string;
    verifiedAt: string | null;
    completedAt: string | null;
    rejectionReason: string | null;
    fulfilmentNotes: string | null;
    handledBy: { id: string; name: string | null } | null;
}

/** Status → badge tone. CANCELED reads neutral, REJECTED reads error: a
 *  withdrawn request is not a refused one. */
const STATUS_TONE: Record<DsarRow['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
    RECEIVED: 'warning',
    VERIFIED: 'info',
    IN_PROGRESS: 'info',
    COMPLETED: 'success',
    REJECTED: 'error',
    CANCELED: 'neutral',
};

export function DsarRegisterClient({
    tenantSlug: _tenantSlug,
    initial,
    canManage,
    title,
}: {
    tenantSlug: string;
    initial: DsarRow[];
    canManage: boolean;
    title: string;
}) {
    const t = useTranslations('admin');
    const tenantHref = useTenantHref();
    const [rows] = useState<DsarRow[]>(initial);

    const columns: Column<DsarRow>[] = [
        {
            key: 'subject',
            header: t('dsar.col.subject'),
            render: (r) => (
                <span className="text-sm">{r.subject.name ?? r.subject.email ?? r.subject.id}</span>
            ),
        },
        {
            key: 'type',
            header: t('dsar.col.type'),
            render: (r) => (
                <StatusBadge variant={r.type === 'ERASURE' ? 'warning' : 'info'}>
                    {t(`dsar.type.${r.type}`)}
                </StatusBadge>
            ),
        },
        {
            key: 'status',
            header: t('dsar.col.status'),
            render: (r) => (
                <StatusBadge variant={STATUS_TONE[r.status]}>{t(`dsar.status.${r.status}`)}</StatusBadge>
            ),
        },
        {
            key: 'requestedAt',
            header: t('dsar.col.requested'),
            render: (r) => <span className="text-sm text-content-muted">{formatDate(r.requestedAt)}</span>,
        },
        {
            key: 'handledBy',
            header: t('dsar.col.handledBy'),
            render: (r) => (
                <span className="text-sm text-content-muted">{r.handledBy?.name ?? '—'}</span>
            ),
        },
    ];

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div className="space-y-default">
                    <PageBreadcrumbs
                        items={[
                            { label: t('crumb.dashboard'), href: tenantHref('/dashboard') },
                            { label: t('title'), href: tenantHref('/admin') },
                            { label: title },
                        ]}
                    />
                    <BackAffordance />
                    <div className="flex items-center gap-compact">
                        <UserFocus className="w-4 h-4 text-content-muted" />
                        <Heading level={1}>{title}</Heading>
                    </div>

                    {/* The load-bearing disclosure. Nothing on this page exports or
                        erases anything — marking a request COMPLETED records that a
                        human did the work out-of-band. A queue that looked like an
                        engine would be worse than no queue at all. */}
                    <InlineNotice variant="info" title={t('dsar.manualTitle')}>
                        {t('dsar.manualBody')}
                    </InlineNotice>

                    {!canManage && (
                        <InlineNotice variant="info">{t('dsar.readOnlyNotice')}</InlineNotice>
                    )}
                </div>
            </ListPageShell.Header>

            <ListPageShell.Body>
                <DataTable
                    fillBody
                    data={rows}
                    columns={columns}
                    getRowId={(r) => r.id}
                    emptyState={{
                        title: t('dsar.emptyTitle'),
                        description: t('dsar.emptyDesc'),
                    }}
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}
