'use client';
import { formatDate } from '@/lib/format-date';
import { useTranslations } from 'next-intl';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { ClipboardCheck } from 'lucide-react';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Plus } from '@/components/ui/icons/nucleo';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FieldGroup } from '@/components/ui/field-group';
import { DateRangePicker } from '@/components/ui/date-picker/date-range-picker';
import { selectDateRangePresets } from '@/components/ui/date-picker/presets-catalogue';
import type { DateRangeValue } from '@/components/ui/date-picker/types';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { InfoTooltip } from '@/components/ui/tooltip';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { cardVariants } from '@/components/ui/card';
import { useToast } from '@/components/ui/hooks';
import { cn } from '@/lib/cn';
import { ReadinessScoreRing, ReadinessLegend } from './ReadinessScoreRing';

// Epic 58 — audit periods are reporting windows. The curated preset
// subset favours periods auditors actually request ("the most recent
// completed quarter", "this fiscal year so far") over day-level
// presets like "Today" that don't map to an audit scope.
const AUDIT_PERIOD_PRESETS = selectDateRangePresets([
    'quarter-to-date',
    'year-to-date',
    'last-quarter',
    'last-year',
    'last-90-days',
    'last-30-days',
]);

const FW_META: Record<string, { icon: AppIconName; label: string; color: string }> = {
    ISO27001: { icon: 'shield', label: 'ISO/IEC 27001:2022', color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: 'globe', label: 'NIS2 Directive', color: 'from-blue-500 to-cyan-600' },
};

// Epic 55 — framework picker options. Labels are intentionally verbose
// (include the version / full regulation name) because the Combobox
// search index benefits from the extra tokens ("ISO", "27001", "NIS2",
// "EU 2022/2555" all become fuzzy-matchable).
const FW_OPTIONS: ComboboxOption<{ version: string }>[] = [
    {
        value: 'ISO27001',
        label: 'ISO/IEC 27001:2022',
        meta: { version: '2022' },
    },
    {
        value: 'NIS2',
        label: 'NIS2 Directive (EU 2022/2555)',
        meta: { version: 'EU_2022_2555' },
    },
];

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    PLANNING: 'neutral', IN_PROGRESS: 'info', READY: 'success', COMPLETE: 'warning',
};

// The readiness overview endpoint returns the cycle list joined with a
// per-cycle readiness score (`scoresByCycleId`). One call gives the
// unified list everything it needs: framework meta, pack counts, AND
// the score ring — collapsing what used to be two near-duplicate pages
// (/audits/cycles + /audits/readiness) into this single surface.
interface CycleRow {
    id: string;
    name: string;
    frameworkKey: string;
    frameworkVersion: string;
    status: string;
    createdAt: string;
    packs?: { id: string }[];
}
interface ScoreEntry {
    score: number;
    recommendations?: string[];
}

export default function AuditCyclesPage() {
    const tx = useTranslations('audits');
    const toast = useToast();
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const [cycles, setCycles] = useState<CycleRow[]>([]);
    const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ frameworkKey: 'ISO27001', frameworkVersion: '2022', name: '' });
    // Epic 58 — the period is stored as a nullable DateRangeValue so
    // half-open ranges ("from X, open-ended") are representable. The
    // backend accepts both `periodStartAt` / `periodEndAt` as
    // optional, so we submit whichever side the user has set.
    const [period, setPeriod] = useState<DateRangeValue>({ from: null, to: null });

    useEffect(() => {
        // Single call: the overview orchestrator fans out per-cycle
        // readiness server-side (no 1+N waterfall) and returns the
        // cycle list joined with `scoresByCycleId`.
        fetch(apiUrl('/audits/readiness/overview'))
            .then(r => r.ok ? r.json() : null)
            .then((data) => {
                if (!data) {
                    toast.error(tx('cycles.loadError'));
                    return;
                }
                setCycles(data.cycles ?? []);
                setScores(data.scoresByCycleId ?? {});
            })
            .catch(() => toast.error(tx('cycles.loadError')))
            .finally(() => setLoading(false));
        // First-mount fetch only — apiUrl is stable per tenant.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiUrl]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        const version = form.frameworkKey === 'NIS2' ? 'EU_2022_2555' : '2022';
        const body: Record<string, unknown> = {
            ...form,
            frameworkVersion: version,
        };
        // Submit the audit period only when the user picked one.
        // Either side may be open-ended; the backend already accepts
        // both fields as optional and validates them as strings.
        if (period.from) body.periodStartAt = period.from.toISOString();
        if (period.to) body.periodEndAt = period.to.toISOString();
        const res = await fetch(apiUrl('/audits/cycles'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            const cycle = await res.json();
            router.push(`/t/${tenantSlug}/audits/cycles/${cycle.id}`);
        } else {
            // Previously a silent no-op — a failed create left the form
            // untouched with no signal. Surface the failure.
            toast.error(tx('cycles.createError'));
        }
    };

    if (loading) return (
        <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-section">
                {[1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}
            </div>
        </div>
    );

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <div className="flex items-center justify-between">
                <div>
                    <PageBreadcrumbs
                        items={[
                            { label: tx('crumb.dashboard'), href: `/t/${tenantSlug}/dashboard` },
                            { label: tx('crumb.audits'), href: `/t/${tenantSlug}/audits` },
                            { label: tx('crumb.cycles') },
                        ]}
                        className="mb-1"
                    />
                    <div className="flex items-center gap-tight">
                        <Heading level={1}>{tx('cycles.title')}</Heading>
                        <InfoTooltip
                            aria-label={tx('readinessLegend.aria')}
                            content={<ReadinessLegend labels={{
                                title: tx('readinessLegend.title'),
                                green: tx('readinessLegend.green'),
                                amber: tx('readinessLegend.amber'),
                                red: tx('readinessLegend.red'),
                            }} />}
                        />
                    </div>
                    <p className="text-content-muted text-sm">{tx('cycles.cycleCount', { count: cycles.length })}</p>
                </div>
                <Button variant="primary" icon={showForm ? undefined : <Plus className="-ml-0.5 -mr-2.5" />} onClick={() => setShowForm(!showForm)} id="create-cycle-btn">
                    {showForm ? tx('cycles.cancel') : tx('cycles.cycle')}
                </Button>
            </div>

            {showForm && (
                <form onSubmit={create} className={cn(cardVariants(), 'animate-fadeIn')} id="cycle-form">
                    <FieldGroup columns={2} gap="md">
                        <FormField
                            label={tx('cycles.frameworkLabel')}
                            required
                            hint={tx('cycles.frameworkHint')}
                        >
                            <Combobox<false, { version: string }>
                                id="fw-select"
                                name="frameworkKey"
                                options={FW_OPTIONS}
                                selected={
                                    FW_OPTIONS.find(
                                        (o) => o.value === form.frameworkKey,
                                    ) ?? null
                                }
                                setSelected={(option) => {
                                    if (!option) return;
                                    setForm((f) => ({
                                        ...f,
                                        frameworkKey: option.value,
                                    }));
                                }}
                                placeholder={tx('cycles.selectFramework')}
                                searchPlaceholder={tx('cycles.searchFrameworks')}
                                matchTriggerWidth
                                buttonProps={{ className: 'w-full' }}
                                caret
                            />
                        </FormField>
                        <FormField label={tx('cycles.cycleName')} required>
                            <Input
                                id="cycle-name-input"
                                required
                                value={form.name}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, name: e.target.value }))
                                }
                                placeholder={tx('cycles.cycleNamePlaceholder')}
                            />
                        </FormField>
                    </FieldGroup>
                    {/*
                      Epic 58 — Audit period. Optional. The shared
                      DateRangePicker handles presets (Quarter to date,
                      Last year, …) + custom ranges in one surface, so
                      auditors don't need two date inputs or a spreadsheet
                      to figure out what "Q2 2026" maps to.
                    */}
                    <div className="mt-4">
                        <FormField
                            label={tx('cycles.auditPeriod')}
                            hint={tx('cycles.auditPeriodHint')}
                        >
                            <DateRangePicker
                                id="cycle-period-range"
                                className="w-full"
                                align="start"
                                placeholder={tx('cycles.selectAuditPeriod')}
                                value={period}
                                onChange={setPeriod}
                                presets={AUDIT_PERIOD_PRESETS}
                                showYearNavigation
                            />
                        </FormField>
                    </div>
                    <div className="mt-4 flex gap-tight">
                        <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>{tx('cycles.cancel')}</Button>
                        <Button type="submit" variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />} id="submit-cycle-btn">{tx('cycles.cycle')}</Button>
                    </div>
                </form>
            )}

            {cycles.length === 0 && !showForm ? (
                <div className={cardVariants({ density: 'none' })}>
                    <EmptyState
                        icon={ClipboardCheck}
                        title={tx('cycles.emptyTitle')}
                        description={tx('cycles.emptyDesc')}
                        primaryAction={{
                            label: tx('cycles.addCycle'),
                            onClick: () => setShowForm(true),
                        }}
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
                    {cycles.map(c => {
                        const meta = FW_META[c.frameworkKey] || { icon: 'shield' as AppIconName, label: c.frameworkKey, color: 'from-gray-500 to-gray-600' };
                        const sc = scores[c.id];
                        return (
                            <div key={c.id} className={cardVariants()} id={`cycle-card-${c.id}`}>
                                <div className="flex items-start gap-default">
                                    <div className="flex-shrink-0">
                                        <ReadinessScoreRing score={sc?.score} noScoreLabel={tx('cycles.noScore')} ariaLabel={sc ? tx('cycles.scoreAria', { score: sc.score }) : tx('cycles.noScore')} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-tight mb-1">
                                            <span className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-lg flex-shrink-0`}>
                                                <AppIcon name={meta.icon} size={20} />
                                            </span>
                                            <StatusBadge variant={STATUS_BADGE[c.status] || 'neutral'}>{c.status}</StatusBadge>
                                        </div>
                                        <Heading level={3} className="truncate">{c.name}</Heading>
                                        <p className="text-xs text-content-muted mt-1">{meta.label} · v{c.frameworkVersion}</p>
                                        <div className="flex items-center gap-tight mt-1 text-xs text-content-subtle">
                                            <span>{tx('cycles.packCount', { count: c.packs?.length || 0 })}</span>
                                            <span>·</span>
                                            <span>{formatDate(c.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-tight">
                                    <Link
                                        href={`/t/${tenantSlug}/audits/cycles/${c.id}`}
                                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                                        id={`cycle-link-${c.id}`}
                                    >
                                        {tx('cycles.openCycle')}
                                    </Link>
                                    <Link
                                        href={`/t/${tenantSlug}/audits/cycles/${c.id}/readiness`}
                                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                                        id={`readiness-link-${c.id}`}
                                    >
                                        {tx('cycles.viewReadiness')}
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
