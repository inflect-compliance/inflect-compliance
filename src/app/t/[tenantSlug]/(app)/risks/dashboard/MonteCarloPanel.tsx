'use client';

/**
 * RQ-3 — Monte Carlo simulation panel on the risk dashboard. Shows the
 * latest run's portfolio VaR + loss-exceedance curve, and runs a new
 * simulation on demand.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KPIStat } from '@/components/ui/metric';
import { Heading } from '@/components/ui/typography';
import { LossExceedanceCurve } from '@/components/ui/charts';
import { useTenantApiUrl, useMoneyFormatter } from '@/lib/tenant-context-provider';
import { formatDateTime } from '@/lib/format-date';

interface Run {
    portfolioMean: number | null; portfolioP50: number | null; portfolioP90: number | null;
    portfolioP95: number | null; portfolioP99: number | null; portfolioStdDev: number | null;
    iterations: number; executionMs: number | null; completedAt: string | null;
    lecPointsJson: Array<{ threshold: number; probability: number }> | null;
    perRiskResultsJson: Array<{ riskId: string; title: string; aleMean: number; contribution: number }> | null;
}
// RQ3-OB-A — money speaks the tenant's currency (useMoneyFormatter).

export function MonteCarloPanel() {
    const apiUrl = useTenantApiUrl();
    const money = useMoneyFormatter();
    const [run, setRun] = useState<Run | null>(null);
    const [running, setRunning] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/risks/simulate'));
            if (res.ok) setRun((await res.json()).run);
        } catch { /* ignore */ }
    }, [apiUrl]);
    useEffect(() => { void load(); }, [load]);

    const runSim = async () => {
        setRunning(true);
        try {
            const res = await fetch(apiUrl('/risks/simulate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iterations: 10000 }) });
            if (res.ok) await load();
        } finally { setRunning(false); }
    };

    const lec = (run?.lecPointsJson ?? []).map((p) => ({ threshold: p.threshold, exceedanceCount: Math.round(p.probability * 100), exceedanceFraction: p.probability }));
    const top = (run?.perRiskResultsJson ?? []).slice(0, 5);

    return (
        <Card data-testid="risk-monte-carlo">
            <div className="mb-default flex items-center justify-between">
                <Heading level={2}>Monte Carlo simulation</Heading>
                <Button variant="primary" size="sm" onClick={runSim} disabled={running}>{running ? 'Running…' : 'Run simulation'}</Button>
            </div>
            {!run ? (
                <p className="text-sm text-content-muted">No simulation yet — run one to compute portfolio VaR + loss distribution.</p>
            ) : (
                <>
                    <p className="mb-default text-xs text-content-muted">
                        Last run {run.completedAt ? formatDateTime(run.completedAt) : ''} · {run.iterations.toLocaleString()} iterations · {run.executionMs ?? 0}ms
                    </p>
                    <div className="mb-default grid grid-cols-2 gap-default md:grid-cols-4">
                        <div className="rounded-md bg-bg-muted/30 px-default py-default"><KPIStat value={money(run.portfolioMean)} label="Mean ALE" /></div>
                        <div className="rounded-md bg-bg-muted/30 px-default py-default"><KPIStat value={money(run.portfolioP95)} label="VaR-95" tone="attention" /></div>
                        <div className="rounded-md bg-bg-muted/30 px-default py-default"><KPIStat value={money(run.portfolioP99)} label="VaR-99" tone="critical" /></div>
                        <div className="rounded-md bg-bg-muted/30 px-default py-default"><KPIStat value={money(run.portfolioStdDev)} label="Std dev (σ)" /></div>
                    </div>
                    <div className="grid grid-cols-1 gap-section lg:grid-cols-2">
                        <div>
                            <Heading level={3} className="mb-2">Loss exceedance (Monte Carlo)</Heading>
                            {lec.length > 0 && (
                                <LossExceedanceCurve data={lec} testId="risk-mc-lec" ariaLabel="Monte Carlo loss exceedance curve" />
                            )}
                        </div>
                        <div>
                            <Heading level={3} className="mb-2">Top contributors</Heading>
                            <div className="space-y-tight">
                                {top.map((r) => (
                                    <div key={r.riskId} className="flex justify-between gap-default rounded p-2 text-sm">
                                        <span className="truncate text-content-emphasis">{r.title}</span>
                                        <span className="tabular-nums text-content-muted">{money(r.aleMean)} · {Math.round(r.contribution * 100)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}
