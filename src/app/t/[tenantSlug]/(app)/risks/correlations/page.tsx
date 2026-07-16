'use client';

/* RQ-8 — Risk correlation matrix editor + PSD validation + auto-suggest. */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tooltip, InfoTooltip } from '@/components/ui/tooltip';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTranslations } from 'next-intl';
import { AnalyticsState } from '../_shared/AnalyticsState';

interface Matrix { riskIds: string[]; riskTitles: string[]; matrix: number[][]; isPositiveSemiDefinite: boolean }
interface Suggestion { riskAId: string; riskBId: string; suggestedCoefficient: number; reason: string }

// Discrete heat bands → semantic background tokens (no raw colours).
function cellClass(v: number): string {
    if (v >= 0.999) return 'bg-bg-muted/40';
    if (v >= 0.6) return 'bg-bg-error/30';
    if (v >= 0.3) return 'bg-bg-warning/30';
    if (v > 0) return 'bg-bg-warning/10';
    if (v < 0) return 'bg-bg-info/20';
    return '';
}

export default function CorrelationMatrixPage() {
    const t = useTranslations('risks');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const matrixQuery = useTenantSWR<{ matrix: Matrix }>('/risks/correlations');
    const m = matrixQuery.data?.matrix ?? null;
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [suggestError, setSuggestError] = useState(false);
    const [sel, setSel] = useState<{ i: number; j: number } | null>(null);
    const [coef, setCoef] = useState('');

    const save = async () => {
        if (!m || !sel) return;
        await fetch(apiUrl('/risks/correlations'), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ riskAId: m.riskIds[sel.i], riskBId: m.riskIds[sel.j], coefficient: Number(coef) }),
        });
        setSel(null); setCoef(''); await matrixQuery.mutate();
    };

    const autoSuggest = async () => {
        setSuggestError(false);
        try {
            const r = await fetch(apiUrl('/risks/correlations/suggest'));
            if (r.ok) setSuggestions((await r.json()).suggestions);
            else setSuggestError(true);
        } catch {
            setSuggestError(true);
        }
    };
    const applySuggestion = async (s: Suggestion) => {
        await fetch(apiUrl('/risks/correlations'), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ riskAId: s.riskAId, riskBId: s.riskBId, coefficient: s.suggestedCoefficient, rationale: s.reason }),
        });
        setSuggestions((prev) => prev.filter((x) => !(x.riskAId === s.riskAId && x.riskBId === s.riskBId)));
        await matrixQuery.mutate();
    };

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('breadcrumbRoot'), href: tenantHref('/risks') }, { label: t('correlations.breadcrumb') }]} />
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-tight">
                    <Heading level={1}>{t('correlations.title')}</Heading>
                    <InfoTooltip title={t('correlations.conceptTitle')} content={t('correlations.conceptHelp')} side="right" />
                </div>
                <div className="flex items-center gap-tight">
                    {suggestError && <span className="text-xs text-content-error" role="alert">{t('correlations.suggestError')}</span>}
                    <Button variant="secondary" size="sm" onClick={autoSuggest}>{t('correlations.autoSuggest')}</Button>
                </div>
            </div>

            <Card className="space-y-default p-6">
                <AnalyticsState
                    isLoading={matrixQuery.isLoading}
                    error={matrixQuery.error}
                    isEmpty={!!m && m.riskIds.length === 0}
                    emptyText={t('correlations.emptyMatrix')}
                    errorText={t('correlations.loadError')}
                >
                    {m && (
                    <>
                    <div className="flex items-center gap-default">
                        <StatusBadge variant={m.isPositiveSemiDefinite ? 'success' : 'error'}>
                            {m.isPositiveSemiDefinite ? t('correlations.isPsd') : t('correlations.notPsd')}
                        </StatusBadge>
                        <InfoTooltip title={t('correlations.psdTitle')} content={t('correlations.psdHelp')} />
                        <span className="text-xs text-content-subtle">{t('correlations.clickHint')}</span>
                    </div>
                    {/* PR-L — a non-PSD matrix is silently dropped from the
                        Monte Carlo (Cholesky fails → independent sampling).
                        Spell out that consequence so the operator knows their
                        configured correlations won't apply until they fix it. */}
                    {!m.isPositiveSemiDefinite && (
                        <div
                            className="rounded-md border border-border-error bg-bg-error/15 p-3 text-sm text-content-error"
                            role="alert"
                            data-testid="correlations-non-psd-warning"
                        >
                            {t('correlations.nonPsdWarning')}
                        </div>
                    )}
                    <div className="overflow-auto">
                        <table className="border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="p-1" />
                                    {m.riskTitles.map((title, j) => (
                                        <th key={j} className="p-1 text-content-subtle">
                                            <Tooltip content={title}><span className="block max-w-24 truncate">{title}</span></Tooltip>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {m.matrix.map((row, i) => (
                                    <tr key={i}>
                                        <td className="p-1 text-content-subtle">
                                            <Tooltip content={m.riskTitles[i]}><span className="block max-w-24 truncate">{m.riskTitles[i]}</span></Tooltip>
                                        </td>
                                        {row.map((v, j) => (
                                            <td
                                                key={j}
                                                className={`border border-border-subtle p-1 text-center tabular-nums ${cellClass(v)} ${j > i ? 'cursor-pointer' : ''}`}
                                                onClick={j > i ? () => { setSel({ i, j }); setCoef(String(v)); } : undefined}
                                            >
                                                {v.toFixed(1)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {sel && (
                        <div className="flex flex-wrap items-end gap-default rounded-md border border-border-emphasis p-default">
                            <span className="text-sm text-content-emphasis">{m.riskTitles[sel.i]} ↔ {m.riskTitles[sel.j]}</span>
                            <label className="block w-24 sm:w-32"><span className="text-xs text-content-muted">{t('correlations.coefficient')}</span>
                                <Input type="text" inputMode="decimal" value={coef} onChange={(e) => setCoef(e.target.value)} />
                            </label>
                            <Button variant="primary" size="sm" onClick={save}>{t('edit.save')}</Button>
                            <Button variant="ghost" size="sm" onClick={() => setSel(null)}>{t('edit.cancel')}</Button>
                        </div>
                    )}
                    </>
                    )}
                </AnalyticsState>
            </Card>

            {suggestions.length > 0 && (
                <Card className="space-y-default p-6">
                    <Heading level={2}>{t('correlations.suggested')}</Heading>
                    <ul className="divide-y divide-border-subtle">
                        {suggestions.map((s) => (
                            <li key={`${s.riskAId}-${s.riskBId}`} className="flex items-center gap-default py-default text-sm">
                                <span className="text-content-muted">{s.reason}</span>
                                <span className="tabular-nums text-content-emphasis">{s.suggestedCoefficient.toFixed(2)}</span>
                                <Button size="sm" variant="secondary" className="ml-auto" onClick={() => applySuggestion(s)}>{t('correlations.apply')}</Button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}
