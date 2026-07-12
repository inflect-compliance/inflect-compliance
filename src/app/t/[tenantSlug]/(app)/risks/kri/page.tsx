'use client';

/* RQ-6 — Key Risk Indicators: RAG cards + sparkline + record reading. */
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { InfoTooltip } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTranslations } from 'next-intl';
import { RiskPicker } from '../_shared/RiskPicker';
import { AnalyticsState } from '../_shared/AnalyticsState';

interface Kri {
    id: string; name: string; unit: string | null; direction: string; greenMax: number | null; amberMax: number | null;
    frequency: string; targetValue: number | null; isActive: boolean;
    /** RQ3-7 — the linked risk (null = orphaned KRI). Drives the deep-link. */
    riskId: string | null;
    latestReading: { value: number; ragStatus: string | null } | null; sparkline: number[];
}
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(values: number[]): string {
    if (values.length === 0) return '—';
    const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
    return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor(((v - min) / span) * (SPARK.length - 1)))]).join('');
}
const ragVariant = (r: string | null | undefined) => (r === 'RED' ? 'error' : r === 'AMBER' ? 'warning' : 'success');

export default function KriPage() {
    const t = useTranslations('risks');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const kriQuery = useTenantSWR<{ kris: Kri[] }>('/risks/kri');
    const kris = kriQuery.data?.kris ?? [];
    const [name, setName] = useState('');
    const [greenMax, setGreenMax] = useState('');
    const [amberMax, setAmberMax] = useState('');
    // P2 — link the KRI to a Risk (unlocks the breach→re-assess loop) and
    // declare which direction is bad; the backend already accepts both.
    const [riskId, setRiskId] = useState<string | null>(null);
    const [direction, setDirection] = useState<'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE'>('HIGHER_IS_WORSE');
    const [busy, setBusy] = useState(false);

    const DIRECTION_OPTIONS: ComboboxOption[] = [
        { value: 'HIGHER_IS_WORSE', label: t('kri.dirHigherWorse') },
        { value: 'LOWER_IS_WORSE', label: t('kri.dirLowerWorse') },
    ];

    const create = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await fetch(apiUrl('/risks/kri'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), greenMax: greenMax.trim() ? Number(greenMax) : null, amberMax: amberMax.trim() ? Number(amberMax) : null, riskId, direction }),
            });
            setName(''); setGreenMax(''); setAmberMax(''); setRiskId(null); setDirection('HIGHER_IS_WORSE'); await kriQuery.mutate();
        } finally { setBusy(false); }
    };

    const record = async (kriId: string, raw: string) => {
        const value = Number(raw);
        if (!isFinite(value)) return;
        await fetch(apiUrl(`/risks/kri/${kriId}/readings`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
        await kriQuery.mutate();
    };

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('breadcrumbRoot'), href: tenantHref('/risks') }, { label: t('kri.breadcrumb') }]} />
            <div className="flex items-center gap-tight">
                <Heading level={1}>{t('kri.title')}</Heading>
                <InfoTooltip title={t('kri.conceptTitle')} content={t('kri.conceptHelp')} side="right" />
            </div>

            <Card className="space-y-default p-6">
                <Heading level={2}>{t('kri.newKri')}</Heading>
                <div className="flex flex-wrap items-end gap-default">
                    <label className="block flex-1"><span className="text-xs text-content-muted">{t('kri.name')}</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('kri.namePlaceholder')} /></label>
                    <label className="block w-24 sm:w-32"><span className="text-xs text-content-muted">{t('kri.greenMax')}</span><Input type="text" inputMode="decimal" value={greenMax} onChange={(e) => setGreenMax(e.target.value)} /></label>
                    <label className="block w-24 sm:w-32"><span className="text-xs text-content-muted">{t('kri.amberMax')}</span><Input type="text" inputMode="decimal" value={amberMax} onChange={(e) => setAmberMax(e.target.value)} /></label>
                </div>
                <div className="flex flex-wrap items-end gap-default">
                    <label className="block flex-1"><span className="text-xs text-content-muted">{t('kri.riskLabel')}</span>
                        <RiskPicker id="kri-risk-picker" value={riskId} onChange={setRiskId} allowNone noneLabel={t('kri.riskNone')} placeholder={t('kri.riskPlaceholder')} />
                    </label>
                    <label className="block w-full sm:w-48"><span className="text-xs text-content-muted">{t('kri.directionLabel')}</span>
                        <Combobox id="kri-direction" options={DIRECTION_OPTIONS} selected={DIRECTION_OPTIONS.find((o) => o.value === direction) ?? null} setSelected={(opt) => { if (opt) setDirection(opt.value as 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE'); }} />
                    </label>
                    <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>{t('kri.create')}</Button>
                </div>
            </Card>

            <AnalyticsState
                isLoading={kriQuery.isLoading}
                error={kriQuery.error}
                isEmpty={kris.length === 0}
                emptyText={t('kri.empty')}
                errorText={t('kri.loadError')}
            >
                <div className="grid grid-cols-1 gap-default md:grid-cols-2">
                    {kris.map((k) => (
                        <Card key={k.id} className="space-y-tight p-6" data-testid="kri-card">
                            <div className="flex items-center justify-between gap-default">
                                <Heading level={3}>{k.name}</Heading>
                                <StatusBadge variant={ragVariant(k.latestReading?.ragStatus)}>
                                    {k.latestReading?.ragStatus ?? t('kri.noData')}{k.latestReading != null ? ` · ${k.latestReading.value}${k.unit ?? ''}` : ''}
                                </StatusBadge>
                            </div>
                            <div className="font-mono text-lg leading-none text-content-emphasis" aria-label={t('kri.trendAria')}>{sparkline(k.sparkline)}</div>
                            <p className="text-xs text-content-muted">
                                {k.targetValue != null ? t('kri.targetPrefix', { value: `${k.targetValue}${k.unit ?? ''}` }) : ''}{k.frequency.toLowerCase()} · {t('kri.thresholds', { green: k.greenMax ?? '—', amber: k.amberMax ?? '—' })}
                            </p>
                            {/* RQ3-7 — when a KRI is breached (RED) and
                                linked to a risk, deep-link straight to
                                that risk's Assessment tab. Closes the
                                sensor → belief loop: the breach is one
                                click from the re-assessment it should
                                trigger. */}
                            {k.riskId && k.latestReading?.ragStatus === 'RED' && (
                                <Link
                                    href={tenantHref(`/risks/${k.riskId}?tab=assessment`)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-content-error underline underline-offset-2"
                                    data-testid={`kri-reassess-link-${k.id}`}
                                >
                                    {t('kri.reassess')}
                                </Link>
                            )}
                            <RecordInline onRecord={(v) => record(k.id, v)} />
                        </Card>
                    ))}
                </div>
            </AnalyticsState>
        </div>
    );
}

function RecordInline({ onRecord }: { onRecord: (v: string) => void }) {
    const t = useTranslations('risks');
    const [v, setV] = useState('');
    return (
        <div className="flex items-end gap-tight">
            <label className="block flex-1"><span className="text-xs text-content-muted">{t('kri.recordReading')}</span>
                <Input type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={t('kri.valuePlaceholder')} />
            </label>
            <Button size="sm" variant="secondary" onClick={() => { onRecord(v); setV(''); }} disabled={!v.trim()}>{t('kri.add')}</Button>
        </div>
    );
}
