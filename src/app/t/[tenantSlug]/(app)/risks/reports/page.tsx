'use client';

/* RQ-10 — Risk reports: templates → generate, recent runs → download. */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { formatDateTime } from '@/lib/format-date';
import { useTranslations } from 'next-intl';
import { AnalyticsState } from '../_shared/AnalyticsState';

interface Template { id: string; name: string; description: string | null; type: string }
interface Run { id: string; format: string; status: string; createdAt: string; templateId: string }

export default function RiskReportsPage() {
    const t = useTranslations('risks');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const reportsQuery = useTenantSWR<{ templates: Template[]; reports: Run[] }>('/risks/reports');
    const templates = reportsQuery.data?.templates ?? [];
    const reports = reportsQuery.data?.reports ?? [];
    const [busy, setBusy] = useState(false);

    const generate = async (templateId: string, format: 'PDF' | 'CSV' | 'PPTX') => {
        setBusy(true);
        try {
            await fetch(apiUrl('/risks/reports'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId, format }) });
            await reportsQuery.mutate();
        } finally { setBusy(false); }
    };

    const nameOf = (id: string) => templates.find((tpl) => tpl.id === id)?.name ?? '—';
    const statusVariant = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'error' : 'info');

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('breadcrumbRoot'), href: tenantHref('/risks') }, { label: t('reports.breadcrumb') }]} />
            <Heading level={1}>{t('reports.title')}</Heading>

            <Card className="space-y-default p-6">
                <Heading level={2}>{t('reports.templates')}</Heading>
                <ul className="divide-y divide-border-subtle">
                    {templates.map((tpl) => (
                        <li key={tpl.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                            <div className="flex-1">
                                <div className="font-medium text-content-emphasis">{tpl.name}</div>
                                {tpl.description && <div className="text-xs text-content-muted">{tpl.description}</div>}
                            </div>
                            <Button size="sm" variant="primary" onClick={() => generate(tpl.id, 'PDF')} disabled={busy}>{t('reports.generatePdf')}</Button>
                            <Button size="sm" variant="secondary" onClick={() => generate(tpl.id, 'PPTX')} disabled={busy}>PPTX</Button>
                            <Button size="sm" variant="secondary" onClick={() => generate(tpl.id, 'CSV')} disabled={busy}>CSV</Button>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card className="space-y-default p-6">
                <Heading level={2}>{t('reports.recent')}</Heading>
                <AnalyticsState
                    isLoading={reportsQuery.isLoading}
                    error={reportsQuery.error}
                    isEmpty={reports.length === 0}
                    emptyText={t('reports.empty')}
                    errorText={t('reports.loadError')}
                >
                    <ul className="divide-y divide-border-subtle">
                        {reports.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                                <span className="text-content-muted">{formatDateTime(r.createdAt)}</span>
                                <span className="font-medium text-content-emphasis">{nameOf(r.templateId)}</span>
                                <span className="font-mono text-xs text-content-subtle">{r.format}</span>
                                <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>
                                {r.status === 'COMPLETED' && (
                                    <a className="ml-auto" href={apiUrl(`/risks/reports/${r.id}/download`)}>
                                        <Button size="sm" variant="ghost">{t('reports.download')}</Button>
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </AnalyticsState>
            </Card>
        </div>
    );
}
