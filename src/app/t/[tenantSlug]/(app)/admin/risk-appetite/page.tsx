'use client';

/* RQ-2 — Risk appetite configuration + breach history. */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { formatDate } from '@/lib/format-date';

type Cadence = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
interface Config {
    totalAleThreshold: number | null;
    singleRiskAleMax: number | null;
    qualScoreMax: number | null;
    appetiteStatement: string | null;
    reviewCadence: Cadence;
}
interface Breach {
    id: string; breachType: string; thresholdValue: number; actualValue: number;
    detectedAt: string; resolvedAt: string | null; acknowledgedAt: string | null; riskId: string | null; category: string | null;
    /** RQ2-6 — the remediation task spawned from this breach. */
    remediationTaskId: string | null;
}
const money = (n: number | null) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);

export default function RiskAppetitePage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const [cfg, setCfg] = useState<Config>({ totalAleThreshold: null, singleRiskAleMax: null, qualScoreMax: null, appetiteStatement: null, reviewCadence: 'ANNUALLY' });
    const [status, setStatus] = useState<{ status: string; portfolioAle: number; activeBreaches: number } | null>(null);
    const [breaches, setBreaches] = useState<Breach[]>([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [c, b] = await Promise.all([
                fetch(apiUrl('/risk-appetite')).then((r) => r.ok ? r.json() : null),
                fetch(apiUrl('/risk-appetite/breaches')).then((r) => r.ok ? r.json() : null),
            ]);
            if (c?.config) setCfg({ ...cfg, ...c.config });
            if (c?.status) setStatus(c.status);
            if (b?.breaches) setBreaches(b.breaches);
        } catch { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiUrl]);
    useEffect(() => { void load(); }, [load]);

    const numField = (label: string, k: 'totalAleThreshold' | 'singleRiskAleMax' | 'qualScoreMax', hint: string) => (
        <label className="block">
            <span className="text-xs text-content-muted">{label} ({hint})</span>
            <Input type="text" inputMode="decimal" value={cfg[k] ?? ''} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value.trim() === '' ? null : Number(e.target.value) })} />
        </label>
    );

    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            const res = await fetch(apiUrl('/risk-appetite'), {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
            });
            if (res.ok) { setMsg('Saved.'); await load(); } else setMsg('Save failed.');
        } finally { setSaving(false); }
    };

    const acknowledge = async (id: string) => {
        await fetch(apiUrl('/risk-appetite/breaches'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ breachId: id }) });
        await load();
    };

    // RQ2-6 — spawn THE remediation task for a breach (idempotent
    // server-side; a second click just re-fetches the same task).
    const [spawningTaskFor, setSpawningTaskFor] = useState<string | null>(null);
    const createRemediationTask = async (id: string) => {
        setSpawningTaskFor(id);
        try {
            await fetch(apiUrl(`/risk-appetite/breaches/${id}/remediation-task`), { method: 'POST' });
            await load();
        } finally {
            setSpawningTaskFor(null);
        }
    };

    const statusVariant = status?.status === 'BREACHED' ? 'error' : status?.status === 'APPROACHING' ? 'warning' : 'success';

    return (
        <div className="space-y-section">
            <PageBreadcrumbs items={[{ label: 'Admin', href: tenantHref('/admin') }, { label: 'Risk appetite' }]} />
            <div className="flex items-center justify-between">
                <Heading level={1}>Risk Appetite</Heading>
                {status && status.status !== 'NONE' && (
                    <StatusBadge variant={statusVariant}>
                        {status.status === 'BREACHED' ? `Breached (${status.activeBreaches})` : status.status === 'APPROACHING' ? 'Approaching' : 'Within appetite'} · {money(status.portfolioAle)}/yr
                    </StatusBadge>
                )}
            </div>

            <Card className="space-y-default p-6">
                <Heading level={2}>Configuration</Heading>
                <label className="block">
                    <span className="text-xs text-content-muted">Appetite statement (board-approved)</span>
                    <Textarea rows={3} value={cfg.appetiteStatement ?? ''} onChange={(e) => setCfg({ ...cfg, appetiteStatement: e.target.value })} />
                </label>
                <div className="grid grid-cols-1 gap-default sm:grid-cols-3">
                    {numField('Portfolio ALE ceiling', 'totalAleThreshold', '$/yr')}
                    {numField('Single-risk ALE max', 'singleRiskAleMax', '$')}
                    {numField('Qualitative score max', 'qualScoreMax', 'of 25')}
                </div>
                {msg && <InlineNotice variant={msg === 'Saved.' ? 'success' : 'error'}>{msg}</InlineNotice>}
                <div className="flex justify-end">
                    <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button>
                </div>
            </Card>

            <Card className="space-y-default p-6">
                <Heading level={2}>Breach history</Heading>
                {breaches.length === 0 ? (
                    <p className="text-sm text-content-muted">No breaches recorded.</p>
                ) : (
                    <ul className="divide-y divide-border-subtle">
                        {breaches.map((b) => (
                            <li key={b.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                                <StatusBadge variant={b.resolvedAt ? 'success' : 'error'}>{b.resolvedAt ? 'Resolved' : 'Active'}</StatusBadge>
                                <span className="font-mono text-xs">{b.breachType}</span>
                                <span className="text-content-muted">threshold {money(b.thresholdValue)} · actual {money(b.actualValue)}</span>
                                <span className="ml-auto text-xs text-content-muted">{formatDate(new Date(b.detectedAt))}</span>
                                {!b.resolvedAt && !b.acknowledgedAt && (
                                    <Button size="sm" variant="ghost" onClick={() => acknowledge(b.id)}>Acknowledge</Button>
                                )}
                                {/* RQ2-6 — breach → remediation task. */}
                                {b.remediationTaskId ? (
                                    <a
                                        href={tenantHref(`/tasks/${b.remediationTaskId}`)}
                                        className="text-xs underline text-content-default"
                                        data-testid={`breach-task-link-${b.id}`}
                                    >
                                        View task
                                    </a>
                                ) : !b.resolvedAt ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => createRemediationTask(b.id)}
                                        disabled={spawningTaskFor === b.id}
                                        data-testid={`breach-task-create-${b.id}`}
                                    >
                                        {spawningTaskFor === b.id ? 'Creating…' : 'Create task'}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
