'use client';

/* RQ-4 — Risk scenarios: list, create, simulate, compare baseline vs scenario. */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { InfoTooltip } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantApiUrl, useTenantHref, useMoneyFormatter } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTranslations } from 'next-intl';
import { RiskPicker } from '../_shared/RiskPicker';
import { AnalyticsState } from '../_shared/AnalyticsState';

interface Scenario { id: string; name: string; status: string; investmentCost: number | null; computedRoi: number | null; createdAt: string }

// P2 — a per-risk override the engine can act on: patch one FAIR field of
// one risk, re-run, compare. Without these the what-if had nothing to model.
interface OverrideDraft { riskId: string; field: string; newValue: number; label: string }
const FAIR_FIELDS = [
    'threatEventFrequency', 'contactFrequency', 'probabilityOfAction',
    'vulnerabilityProbability', 'threatCapability', 'controlStrength',
    'primaryLossMagnitude', 'productivityLoss', 'responseCost', 'replacementCost',
    'secondaryLossEventFrequency', 'secondaryLossMagnitude',
] as const;
interface Comparison {
    baseline: { portfolioAle: { mean: number; p95: number; p99: number }; correlationsDropped?: boolean };
    scenario: { portfolioAle: { mean: number; p95: number; p99: number }; correlationsDropped?: boolean };
    delta: { meanAleDelta: number; varP95Delta: number; varP99Delta: number; roi: number | null };
    perRiskDeltas: Array<{ riskId: string; title: string; baselineAle: number; scenarioAle: number; deltaPercent: number }>;
}
// RQ3-OB-A — money speaks the tenant's currency (useMoneyFormatter).

export default function RiskScenariosPage() {
    const t = useTranslations('risks');
    const apiUrl = useTenantApiUrl();
    const money = useMoneyFormatter();
    const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
    const tenantHref = useTenantHref();
    const scenariosQuery = useTenantSWR<{ scenarios: Scenario[] }>('/risks/scenarios');
    const scenarios = scenariosQuery.data?.scenarios ?? [];
    const [name, setName] = useState('');
    const [investment, setInvestment] = useState('');
    const [cmp, setCmp] = useState<Comparison | null>(null);
    const [busy, setBusy] = useState(false);
    // Override builder.
    const [overrides, setOverrides] = useState<OverrideDraft[]>([]);
    const [ovRiskId, setOvRiskId] = useState<string | null>(null);
    const [ovRiskLabel, setOvRiskLabel] = useState<string>('');
    const [ovField, setOvField] = useState<string>('primaryLossMagnitude');
    const [ovValue, setOvValue] = useState<string>('');

    const fieldOptions: ComboboxOption[] = FAIR_FIELDS.map((f) => ({ value: f, label: t(`scenarios.field_${f}` as Parameters<typeof t>[0]) }));
    const fieldLabel = (f: string) => t(`scenarios.field_${f}` as Parameters<typeof t>[0]);

    const addOverride = () => {
        const v = Number(ovValue);
        if (!ovRiskId || !Number.isFinite(v)) return;
        setOverrides((prev) => [
            ...prev.filter((o) => !(o.riskId === ovRiskId && o.field === ovField)),
            { riskId: ovRiskId, field: ovField, newValue: v, label: ovRiskLabel },
        ]);
        setOvValue('');
    };
    const removeOverride = (i: number) => setOverrides((prev) => prev.filter((_, idx) => idx !== i));

    const load = () => scenariosQuery.mutate();

    const create = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await fetch(apiUrl('/risks/scenarios'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    investmentCost: investment.trim() ? Number(investment) : null,
                    overrides: overrides.map((o) => ({ riskId: o.riskId, field: o.field, newValue: o.newValue })),
                }),
            });
            setName(''); setInvestment(''); setOverrides([]); await load();
        } finally { setBusy(false); }
    };

    const simulate = async (id: string) => {
        setBusy(true); setCmp(null);
        try {
            const r = await fetch(apiUrl(`/risks/scenarios/${id}/simulate`), { method: 'POST' });
            if (r.ok) { setCmp((await r.json()).comparison); await load(); }
        } finally { setBusy(false); }
    };

    const archive = async (id: string) => { await fetch(apiUrl(`/risks/scenarios/${id}`), { method: 'DELETE' }); await load(); };

    // PR-L — clone a scenario (name + overrides) so a mis-created what-if is
    // recoverable without rebuilding it from scratch.
    const clone = async (s: Scenario) => {
        setBusy(true);
        try {
            await fetch(apiUrl(`/risks/scenarios/${s.id}/clone`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: t('scenarios.cloneName', { name: s.name }) }),
            });
            await load();
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('breadcrumbRoot'), href: tenantHref('/risks') }, { label: t('scenarios.breadcrumb') }]} />
            <Heading level={1}>{t('scenarios.title')}</Heading>

            <Card className="space-y-default p-6">
                <Heading level={2}>{t('scenarios.newScenario')}</Heading>
                <p className="text-sm text-content-muted">{t('scenarios.intro')}</p>
                <div className="flex flex-wrap items-end gap-default">
                    <label className="block flex-1"><span className="text-xs text-content-muted">{t('scenarios.name')}</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('scenarios.namePlaceholder')} /></label>
                    <label className="block"><span className="text-xs text-content-muted">{t('scenarios.investment')}</span><Input type="text" inputMode="decimal" value={investment} onChange={(e) => setInvestment(e.target.value)} placeholder={t('scenarios.investmentPlaceholder')} /></label>
                </div>

                {/* P2 — per-risk override builder. Each override patches one FAIR
                    field of one risk; the engine re-runs and compares. */}
                <div className="space-y-tight border-t border-border-subtle pt-default">
                    <span className="inline-flex items-center gap-tight text-xs font-medium text-content-muted">
                        {t('scenarios.overridesTitle')}
                        <InfoTooltip title={t('scenarios.conceptTitle')} content={t('scenarios.conceptHelp')} />
                    </span>
                    <div className="flex flex-wrap items-end gap-default">
                        <label className="block flex-1"><span className="text-xs text-content-muted">{t('scenarios.overrideRisk')}</span>
                            <RiskPicker id="scenario-override-risk" value={ovRiskId} onChange={(id, label) => { setOvRiskId(id); setOvRiskLabel(label ?? ''); }} placeholder={t('scenarios.overrideRiskPlaceholder')} />
                        </label>
                        <label className="block w-full sm:w-48"><span className="text-xs text-content-muted">{t('scenarios.overrideField')}</span>
                            <Combobox id="scenario-override-field" options={fieldOptions} selected={fieldOptions.find((o) => o.value === ovField) ?? null} setSelected={(opt) => { if (opt) setOvField(String(opt.value)); }} />
                        </label>
                        <label className="block w-full sm:w-32"><span className="text-xs text-content-muted">{t('scenarios.overrideValue')}</span>
                            <Input type="text" inputMode="decimal" value={ovValue} onChange={(e) => setOvValue(e.target.value)} placeholder={t('scenarios.overrideValuePlaceholder')} />
                        </label>
                        <Button variant="secondary" onClick={addOverride} disabled={!ovRiskId || !ovValue.trim()}>{t('scenarios.addOverride')}</Button>
                    </div>
                    {overrides.length > 0 && (
                        <ul className="space-y-tight" data-testid="scenario-overrides">
                            {overrides.map((o, i) => (
                                <li key={`${o.riskId}-${o.field}`} className="flex items-center justify-between gap-default rounded-md border border-border-subtle px-3 py-1.5 text-sm">
                                    <span className="truncate text-content-emphasis">{o.label || o.riskId}</span>
                                    <span className="tabular-nums text-content-muted">{fieldLabel(o.field)} → {o.newValue}</span>
                                    <Button size="sm" variant="ghost" onClick={() => removeOverride(i)}>{t('scenarios.removeOverride')}</Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>{t('scenarios.create')}</Button>
                </div>
            </Card>

            <Card className="space-y-default p-6">
                <Heading level={2}>{t('scenarios.breadcrumb')}</Heading>
                <AnalyticsState
                    isLoading={scenariosQuery.isLoading}
                    error={scenariosQuery.error}
                    isEmpty={scenarios.length === 0}
                    emptyText={t('scenarios.empty')}
                    errorText={t('scenarios.loadError')}
                >
                    <ul className="divide-y divide-border-subtle">
                        {scenarios.map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center gap-default py-default text-sm">
                                <StatusBadge variant={s.status === 'SIMULATED' ? 'success' : s.status === 'ARCHIVED' ? 'neutral' : 'info'}>{s.status}</StatusBadge>
                                <span className="font-medium text-content-emphasis">{s.name}</span>
                                {s.investmentCost != null && <span className="text-content-muted">{t('scenarios.invest', { money: money(s.investmentCost) })}</span>}
                                {s.computedRoi != null && <span className="text-content-muted">{t('scenarios.roi', { roi: s.computedRoi.toFixed(1) })}</span>}
                                <span className="ml-auto flex gap-tight">
                                    {s.status !== 'ARCHIVED' && <Button size="sm" variant="secondary" onClick={() => simulate(s.id)} disabled={busy}>{t('scenarios.simulate')}</Button>}
                                    <Button size="sm" variant="ghost" onClick={() => clone(s)} disabled={busy} data-testid={`scenario-clone-${s.id}`}>{t('scenarios.clone')}</Button>
                                    {s.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={() => archive(s.id)}>{t('scenarios.archive')}</Button>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </AnalyticsState>
            </Card>

            {cmp && (
                <Card className="space-y-default p-6" data-testid="scenario-comparison">
                    <Heading level={2}>{t('scenarios.baselineVsScenario')}</Heading>
                    {/* Match the dashboard MonteCarloPanel's honesty: if either
                        sim dropped its correlation matrix (Cholesky failed →
                        independent sampling), the VaR figures understate tail
                        co-movement — tell the operator. */}
                    {(cmp.baseline.correlationsDropped || cmp.scenario.correlationsDropped) && (
                        <div
                            className="rounded-md border border-border-warning bg-bg-warning/15 p-3 text-sm text-content-warning"
                            role="alert"
                            data-testid="scenario-correlations-dropped"
                        >
                            {t('scenarios.correlationsDropped')}
                        </div>
                    )}
                    <table className="w-full text-sm">
                        <thead><tr className="text-content-muted"><th className="text-left">{t('scenarios.colMetric')}</th><th className="text-right">{t('scenarios.colBaseline')}</th><th className="text-right">{t('scenarios.colScenario')}</th><th className="text-right">{t('scenarios.colDelta')}</th></tr></thead>
                        <tbody className="tabular-nums">
                            <tr><td>{t('scenarios.meanAle')}</td><td className="text-right">{money(cmp.baseline.portfolioAle.mean)}</td><td className="text-right">{money(cmp.scenario.portfolioAle.mean)}</td><td className="text-right">{signed(cmp.delta.meanAleDelta)}</td></tr>
                            <tr><td>{t('scenarios.var95')}</td><td className="text-right">{money(cmp.baseline.portfolioAle.p95)}</td><td className="text-right">{money(cmp.scenario.portfolioAle.p95)}</td><td className="text-right">{signed(cmp.delta.varP95Delta)}</td></tr>
                            <tr><td>{t('scenarios.var99')}</td><td className="text-right">{money(cmp.baseline.portfolioAle.p99)}</td><td className="text-right">{money(cmp.scenario.portfolioAle.p99)}</td><td className="text-right">{signed(cmp.delta.varP99Delta)}</td></tr>
                            {cmp.delta.roi != null && <tr><td>{t('scenarios.roiLabel')}</td><td /><td /><td className="text-right">{cmp.delta.roi.toFixed(1)}×</td></tr>}
                        </tbody>
                    </table>
                    {cmp.perRiskDeltas.length > 0 && (
                        <div>
                            <Heading level={3} className="mb-2">{t('scenarios.perRiskImpact')}</Heading>
                            <ul className="space-y-tight">
                                {cmp.perRiskDeltas.map((d) => (
                                    <li key={d.riskId} className="flex justify-between gap-default text-sm">
                                        <span className="truncate text-content-emphasis">{d.title}</span>
                                        <span className="tabular-nums text-content-muted">{money(d.baselineAle)} → {money(d.scenarioAle)} ({d.deltaPercent.toFixed(0)}%)</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
