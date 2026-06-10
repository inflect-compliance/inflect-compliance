'use client';

/* RQ-10 — Risk reports: templates → generate, recent runs → download. */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { formatDateTime } from '@/lib/format-date';

interface Template { id: string; name: string; description: string | null; type: string }
interface Run { id: string; format: string; status: string; createdAt: string; templateId: string }

export default function RiskReportsPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [reports, setReports] = useState<Run[]>([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { const r = await fetch(apiUrl('/risks/reports')); if (r.ok) { const d = await r.json(); setTemplates(d.templates); setReports(d.reports); } } catch { /* ignore */ }
    }, [apiUrl]);
    useEffect(() => { void load(); }, [load]);

    const generate = async (templateId: string, format: 'PDF' | 'CSV') => {
        setBusy(true);
        try {
            await fetch(apiUrl('/risks/reports'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId, format }) });
            await load();
        } finally { setBusy(false); }
    };

    const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? '—';
    const statusVariant = (s: string) => (s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'error' : 'info');

    return (
        <div className="space-y-section">
            <PageBreadcrumbs items={[{ label: 'Risks', href: tenantHref('/risks') }, { label: 'Reports' }]} />
            <Heading level={1}>Risk Reports</Heading>

            <Card className="space-y-default p-6">
                <Heading level={2}>Templates</Heading>
                <ul className="divide-y divide-border-subtle">
                    {templates.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                            <div className="flex-1">
                                <div className="font-medium text-content-emphasis">{t.name}</div>
                                {t.description && <div className="text-xs text-content-muted">{t.description}</div>}
                            </div>
                            <Button size="sm" variant="primary" onClick={() => generate(t.id, 'PDF')} disabled={busy}>Generate PDF</Button>
                            <Button size="sm" variant="secondary" onClick={() => generate(t.id, 'CSV')} disabled={busy}>CSV</Button>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card className="space-y-default p-6">
                <Heading level={2}>Recent reports</Heading>
                {reports.length === 0 ? (
                    <p className="text-sm text-content-muted">No reports generated yet.</p>
                ) : (
                    <ul className="divide-y divide-border-subtle">
                        {reports.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                                <span className="text-content-muted">{formatDateTime(r.createdAt)}</span>
                                <span className="font-medium text-content-emphasis">{nameOf(r.templateId)}</span>
                                <span className="font-mono text-xs text-content-subtle">{r.format}</span>
                                <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>
                                {r.status === 'COMPLETED' && (
                                    <a className="ml-auto" href={apiUrl(`/risks/reports/${r.id}/download`)}>
                                        <Button size="sm" variant="ghost">Download</Button>
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
