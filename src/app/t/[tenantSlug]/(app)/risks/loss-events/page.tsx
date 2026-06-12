'use client';

/**
 * RQ3-6 — the loss-event register page (predicted-vs-actual surface).
 *
 * Three sections, top-to-bottom:
 *   1. The roll-up: total recorded actuals + count, with a per-year
 *      mini-bars view so "three years of actuals vs the curve" reads
 *      at a glance. The simulator's latest Mean / P90 horizon lines
 *      ride alongside as honest references.
 *   2. The "record loss" form — manual entry; FINDING / INCIDENT
 *      sources land here too, the form just defaults to USER.
 *   3. The recent register — descending occurredAt, with the loss
 *      narrative, the source chip, and an ADMIN remove affordance.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Heading } from '@/components/ui/typography';
import { KPIStat } from '@/components/ui/metric';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import { type DateValue } from '@/components/ui/date-picker/types';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { useTenantApiUrl, useTenantHref, useMoneyFormatter } from '@/lib/tenant-context-provider';
import { formatDate } from '@/lib/format-date';

type Source = 'USER' | 'FINDING' | 'INCIDENT';
interface Row {
    id: string;
    riskId: string | null;
    occurredAt: string;
    amount: number;
    description: string | null;
    source: Source;
    justification: string | null;
    createdByUserId: string | null;
    createdAt: string;
}
interface Aggregate {
    total: number;
    count: number;
    byYear: Array<{ year: number; total: number; count: number }>;
    byRisk: Array<{ riskId: string | null; total: number; count: number }>;
}
interface Run {
    portfolioMean: number | null;
    portfolioP90: number | null;
    completedAt: string | null;
}

const SOURCE_VARIANT: Record<Source, 'info' | 'warning' | 'error'> = {
    USER: 'info',
    FINDING: 'warning',
    INCIDENT: 'error',
};

export default function LossEventsPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const money = useMoneyFormatter();
    const [rows, setRows] = useState<Row[]>([]);
    const [agg, setAgg] = useState<Aggregate | null>(null);
    const [run, setRun] = useState<Run | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // Form state.
    const [occurredAt, setOccurredAt] = useState<DateValue>(() => {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    });
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [source, setSource] = useState<Source>('USER');

    const load = useCallback(async () => {
        try {
            const [list, aggr, sim] = await Promise.all([
                fetch(apiUrl('/loss-events?take=50')).then((r) => (r.ok ? r.json() : null)),
                fetch(apiUrl('/loss-events/aggregate')).then((r) => (r.ok ? r.json() : null)),
                fetch(apiUrl('/risks/simulate')).then((r) => (r.ok ? r.json() : null)),
            ]);
            setRows(list?.events ?? []);
            setAgg(aggr ?? null);
            setRun(sim?.run ?? null);
        } catch { /* failure-soft */ }
    }, [apiUrl]);
    useEffect(() => { void load(); }, [load]);

    const record = async () => {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt < 0 || occurredAt == null) return;
        setBusy(true); setMsg(null);
        try {
            const res = await fetch(apiUrl('/loss-events'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    occurredAt: occurredAt.toISOString(),
                    amount: amt,
                    description: description.trim() || null,
                    source,
                }),
            });
            if (res.ok) {
                setMsg('Loss recorded.');
                setAmount(''); setDescription('');
                await load();
            } else {
                setMsg('Save failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        await fetch(apiUrl(`/loss-events/${id}`), { method: 'DELETE' });
        await load();
    };

    const yearMax = agg?.byYear.length
        ? Math.max(...agg.byYear.map((y) => y.total))
        : 0;

    return (
        <div className="space-y-section">
            <PageBreadcrumbs
                items={[
                    { label: 'Risks', href: tenantHref('/risks') },
                    { label: 'Loss events' },
                ]}
            />
            <Heading level={1}>Loss events</Heading>
            <p className="text-sm text-content-muted">
                The system predicts losses everywhere — FAIR ALE, the simulated portfolio
                P50/P90, the loss-exceedance curve. This is where the world&apos;s answer comes
                back, so the forecasts can be scored.
            </p>

            {/* Predicted-vs-actual overlay */}
            <Card className="space-y-default p-6" data-testid="loss-events-rollup">
                <Heading level={2}>Predicted vs actual</Heading>
                {!agg || agg.count === 0 ? (
                    <p className="text-sm text-content-muted" data-testid="loss-events-empty">
                        No actuals recorded yet — the forecasting stack is unfalsifiable
                        until losses come back in. Record the next one below, or enable the
                        finding / incident close-out integration to record them automatically.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-default md:grid-cols-3">
                            <div className="rounded-md bg-bg-muted/30 px-default py-default" data-testid="loss-events-total">
                                <KPIStat value={money(agg.total)} label="Total recorded losses" />
                            </div>
                            <div className="rounded-md bg-bg-muted/30 px-default py-default" data-testid="loss-events-count">
                                <KPIStat value={agg.count} label="Loss events" />
                            </div>
                            <div className="rounded-md bg-bg-muted/30 px-default py-default" data-testid="loss-events-years">
                                <KPIStat value={agg.byYear.length} label="Calendar years" />
                            </div>
                        </div>
                        {/* Per-year mini-bars: the actuals, with the
                            simulator's per-year predictions as honest
                            horizon lines. */}
                        <div className="mt-default space-y-tight" data-testid="loss-events-by-year">
                            {agg.byYear.map((y) => (
                                <div key={y.year} className="flex items-center gap-default text-sm">
                                    <span className="w-12 shrink-0 text-content-emphasis tabular-nums">{y.year}</span>
                                    <div className="flex-1">
                                        <ProgressBar
                                            value={y.total}
                                            max={yearMax || 1}
                                            aria-label={`Actual losses in ${y.year}: ${money(y.total)}`}
                                        />
                                    </div>
                                    <span className="w-24 shrink-0 text-right tabular-nums text-content-muted">{money(y.total)}</span>
                                    <span className="w-12 shrink-0 text-right tabular-nums text-content-subtle">{y.count}</span>
                                </div>
                            ))}
                        </div>
                        {run && (run.portfolioMean != null || run.portfolioP90 != null) && (
                            <p className="mt-tight text-xs text-content-subtle" data-testid="loss-events-prediction-line">
                                Simulator&apos;s annual prediction
                                {run.portfolioMean != null && <> — mean {money(run.portfolioMean)}</>}
                                {run.portfolioP90 != null && <> · P90 {money(run.portfolioP90)}</>}
                            </p>
                        )}
                    </>
                )}
            </Card>

            {/* Record loss form */}
            <Card className="space-y-default p-6" data-testid="loss-events-form">
                <Heading level={2}>Record loss</Heading>
                <div className="flex flex-wrap items-end gap-default">
                    <div className="block">
                        <span className="mb-0.5 block text-xs text-content-muted">Date</span>
                        <DatePicker
                            value={occurredAt}
                            onChange={setOccurredAt}
                            placeholder="When did it occur"
                        />
                    </div>
                    <label className="block">
                        <span className="text-xs text-content-muted">Amount</span>
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="50000"
                        />
                    </label>
                    <label className="block flex-1 min-w-[12rem]">
                        <span className="text-xs text-content-muted">What happened</span>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Customer breach response — settlement + vendor X"
                        />
                    </label>
                    <div className="flex gap-tight">
                        {(['USER', 'FINDING', 'INCIDENT'] as Source[]).map((s) => (
                            <Button
                                key={s}
                                size="sm"
                                variant={source === s ? 'secondary' : 'ghost'}
                                onClick={() => setSource(s)}
                            >
                                {s}
                            </Button>
                        ))}
                    </div>
                    <Button variant="primary" onClick={record} disabled={busy || !amount.trim()}>
                        {busy ? 'Recording…' : 'Record'}
                    </Button>
                </div>
                {msg && <InlineNotice variant={msg === 'Loss recorded.' ? 'success' : 'error'}>{msg}</InlineNotice>}
            </Card>

            {/* Register */}
            <Card className="space-y-default p-6" data-testid="loss-events-list">
                <Heading level={2}>Register</Heading>
                {rows.length === 0 ? (
                    <p className="text-sm text-content-muted">No loss events yet.</p>
                ) : (
                    <ul className="divide-y divide-border-subtle">
                        {rows.map((r) => (
                            <li
                                key={r.id}
                                className="flex flex-wrap items-center gap-default py-default text-sm"
                                data-testid={`loss-event-row-${r.id}`}
                            >
                                <span className="w-24 tabular-nums text-content-muted">{formatDate(r.occurredAt)}</span>
                                <StatusBadge variant={SOURCE_VARIANT[r.source]}>{r.source}</StatusBadge>
                                <span className="font-medium text-content-emphasis tabular-nums">{money(r.amount)}</span>
                                {r.description && (
                                    <span className="truncate text-content-muted">{r.description}</span>
                                )}
                                <span className="ml-auto flex gap-tight">
                                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                                        Remove
                                    </Button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
