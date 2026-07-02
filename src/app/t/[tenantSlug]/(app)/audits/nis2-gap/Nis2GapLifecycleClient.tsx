'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { DataTable, createColumns } from '@/components/ui/table';
import { KPIStat } from '@/components/ui/metric';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/typography';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Checkbox } from '@/components/ui/checkbox';
import { UserCombobox } from '@/components/ui/user-combobox';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import {
    TimeSeriesChart, Bars, XAxis, YAxis,
    RadarChart, chartReady, chartEmpty, type RadarAxisDatum,
} from '@/components/ui/charts';
import { formatDate } from '@/lib/format-date';

// CC BY 4.0 attribution — carries everywhere derived NIS2 content renders.
const NIS2_ATTRIBUTION =
    'NIS2 gap-assessment questions © NISD2 contributors (Kardashev Catalyst UG / nisd2.eu), CC BY 4.0';
const NIS2_SOURCE_URL = 'https://github.com/NISD2/nis2-gap-assessment-schema';

type Bilingual = { en: string; de: string };
type Gap = {
    questionId: string; domainId: number; criticality: string; consequence: string;
    fineExposure: boolean; timeToFix: string; legalBasis: string; answer: string;
    priority: number; priorityTier: string; plainText: Bilingual;
};
type DomainScore = { domainId: number; code: string; name: Bilingual; score: number; answered: number; total: number };
type RunSummary = { id: string; source: string; status: string; completedAt: string | null; createdAt: string; overall: number; gapCount: number; answered: number; total: number };
type Snapshot = { score: number; gapCount: number; computedAt: string };
type Payload = {
    history: RunSummary[];
    snapshots: Snapshot[];
    latest: { score: { overall: number; byDomain: DomainScore[] }; gaps: Gap[]; fineExposureGaps: number; answeredTotal: number; questionTotal: number };
};
type Suggestion = {
    questionId: string; title: string; legalBasis: string; priorityTier: string;
    criticality: string; consequence: string; fineExposure: boolean;
    kind: 'RISK' | 'CONTROL_LINK' | 'CONTROL_CREATE' | 'TASK'; reason: string;
    existingControls?: Array<{ id: string; name: string }>;
};

function critVariant(c: string): 'error' | 'warning' | 'info' | 'neutral' {
    if (c === 'CRITICAL') return 'error';
    if (c === 'HIGH') return 'warning';
    if (c === 'MEDIUM') return 'info';
    return 'neutral';
}
function kindLabel(k: Suggestion['kind']): string {
    return k === 'RISK' ? 'Risk' : k === 'TASK' ? 'Task' : k === 'CONTROL_LINK' ? 'Link control' : 'New control';
}

export function Nis2GapLifecycleClient({ tenantSlug, canWrite }: { tenantSlug: string; canWrite: boolean }) {
    const locale = useLocale();
    const lang = locale === 'de' ? 'de' : 'en';
    const base = `/api/t/${tenantSlug}/audits/nis2-gap`;

    const [data, setData] = useState<Payload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [rerunning, setRerunning] = useState(false);

    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [approved, setApproved] = useState<Record<string, boolean>>({});
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [stateRes, remRes] = await Promise.all([
                fetch(base),
                fetch(`${base}/remediations?minCriticality=HIGH`),
            ]);
            if (!stateRes.ok) throw new Error('Failed to load NIS2 gap assessment.');
            setData(await stateRes.json());
            if (remRes.ok) {
                const r = await remRes.json();
                setSuggestions(r.suggestions ?? []);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load NIS2 gap assessment.');
        } finally {
            setLoading(false);
        }
    }, [base]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const handleRerun = useCallback(async () => {
        setRerunning(true);
        setNotice(null);
        try {
            const res = await fetch(`${base}/rerun`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to start a re-assessment.');
            setNotice('New re-assessment started. Answer it from the onboarding NIS2 step, then return here — this run joins the history below.');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start a re-assessment.');
        } finally {
            setRerunning(false);
        }
    }, [base, load]);

    const handleApply = useCallback(async () => {
        setApplying(true);
        try {
            const approvals = suggestions
                .filter((s) => approved[s.questionId])
                .map((s) => ({
                    questionId: s.questionId,
                    kind: s.kind,
                    linkControlId: s.kind === 'CONTROL_LINK' ? s.existingControls?.[0]?.id : undefined,
                }));
            const res = await fetch(`${base}/remediations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvals }),
            });
            if (!res.ok) throw new Error('Failed to create the approved items.');
            const r = await res.json();
            setNotice(`Created ${r.risksCreated} risk(s), ${r.controlsCreated} control(s), ${r.tasksCreated} task(s) · skipped ${r.skipped}.`);
            setApproved({});
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create the approved items.');
        } finally {
            setApplying(false);
        }
    }, [base, suggestions, approved, load]);

    const radarState = useMemo(() => {
        const byDomain = data?.latest.score.byDomain ?? [];
        if (byDomain.length === 0) return chartEmpty<RadarAxisDatum[]>();
        return chartReady<RadarAxisDatum[]>(byDomain.map((d) => ({ key: d.code, label: d.name?.[lang] ?? d.code, value: d.score })));
    }, [data, lang]);

    const trend = useMemo(
        () => (data?.snapshots ?? []).map((s) => ({ date: new Date(s.computedAt), values: { value: s.score } })),
        [data],
    );

    const historyColumns = useMemo(
        () => createColumns<RunSummary>([
            {
                id: 'run', header: 'Run', cell: ({ row }) => (
                    <StatusBadge variant={row.original.source === 'WIZARD_BASELINE' ? 'info' : 'neutral'} size="sm">
                        {row.original.source === 'WIZARD_BASELINE' ? 'Baseline' : 'Re-assessment'}
                    </StatusBadge>
                ),
            },
            { accessorKey: 'overall', header: 'Score', cell: ({ row }) => <span className="tabular-nums">{row.original.overall}</span> },
            { accessorKey: 'gapCount', header: 'Gaps', cell: ({ row }) => <span className="tabular-nums text-content-muted">{row.original.gapCount}</span> },
            { id: 'answered', header: 'Answered', cell: ({ row }) => <span className="tabular-nums text-content-muted">{row.original.answered}/{row.original.total}</span> },
            { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className="text-content-muted">{row.original.status}</span> },
            { id: 'date', header: 'Date', cell: ({ row }) => <span className="text-content-muted">{formatDate(new Date(row.original.createdAt))}</span> },
        ]),
        [],
    );

    const gapColumns = useMemo(
        () => createColumns<Gap>([
            { accessorKey: 'plainText', header: 'Gap', cell: ({ row }) => <span>{row.original.plainText?.[lang]}</span> },
            { accessorKey: 'criticality', header: 'Criticality', cell: ({ row }) => <StatusBadge variant={critVariant(row.original.criticality)} size="sm">{row.original.criticality}</StatusBadge> },
            {
                id: 'liability', header: 'Liability', cell: ({ row }) => (
                    row.original.consequence === 'PERSONAL_LIABILITY'
                        ? <StatusBadge variant="error" size="sm">Personal liability</StatusBadge>
                        : row.original.fineExposure
                            ? <StatusBadge variant="warning" size="sm">Fine exposure</StatusBadge>
                            : <span className="text-content-muted text-xs">{row.original.consequence}</span>
                ),
            },
            { accessorKey: 'answer', header: 'Answer', cell: ({ row }) => <span className="text-content-muted">{row.original.answer}</span> },
            { accessorKey: 'timeToFix', header: 'Effort', cell: ({ row }) => <span className="text-content-muted">{row.original.timeToFix}</span> },
            { accessorKey: 'legalBasis', header: 'Legal basis', cell: ({ row }) => <span className="text-xs text-content-muted">{row.original.legalBasis}</span> },
        ]),
        [lang],
    );

    const approvedCount = suggestions.filter((s) => approved[s.questionId]).length;

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <PageHeader
                breadcrumbs={[
                    { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                    { label: 'Audits', href: `/t/${tenantSlug}/audits` },
                    { label: 'NIS2 Gap Assessment' },
                ]}
                title="NIS2 Gap Assessment"
                description="Track your NIS2 maturity over time, see what changed, and turn priority gaps into remediation — you approve before anything is created."
                actions={
                    canWrite ? (
                        <Button variant="secondary" onClick={handleRerun} disabled={rerunning} id="nis2-gap-rerun-btn">
                            {rerunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Re-run assessment
                        </Button>
                    ) : undefined
                }
            />

            <InlineNotice variant="info">
                This is a self-assessment maturity aid, <strong>not a legal compliance
                determination</strong> of NIS2 conformance. It informs remediation; it
                does not certify anything or replace an auditor.
            </InlineNotice>

            {notice && <InlineNotice variant="success">{notice}</InlineNotice>}
            {error && <p className="text-sm text-content-error">{error}</p>}

            {loading ? (
                <div className="flex items-center gap-tight p-6 text-content-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading gap assessment…
                </div>
            ) : !data ? null : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
                        <div className={cardVariants({ density: 'comfortable' })}>
                            <KPIStat value={`${data.latest.score.overall}`} label="Readiness score" description="weighted maturity (0–100)" />
                        </div>
                        <div className={cardVariants({ density: 'comfortable' })}>
                            <KPIStat value={`${data.latest.fineExposureGaps}`} label="Gaps with fine exposure" tone={data.latest.fineExposureGaps > 0 ? 'critical' : 'default'} description="regulatory fine / liability risk" />
                        </div>
                        <div className={cardVariants({ density: 'comfortable' })}>
                            <KPIStat value={`${data.latest.gaps.length}`} label="Open gaps" description={`${data.latest.answeredTotal}/${data.latest.questionTotal} answered`} />
                        </div>
                    </div>

                    {trend.length >= 2 && (
                        <div className={cn(cardVariants({ density: 'comfortable' }), 'space-y-tight')}>
                            <Heading level={3}>Readiness over time</Heading>
                            <div className="h-56">
                                <TimeSeriesChart
                                    data={trend}
                                    series={[{ id: 'score', isActive: true, valueAccessor: (d: { values: { value: number } }) => d.values.value, colorClassName: 'text-brand-default' }]}
                                    type="bar"
                                >
                                    <YAxis showGridLines />
                                    <Bars />
                                    <XAxis tickFormat={(d: Date) => formatDate(d)} />
                                </TimeSeriesChart>
                            </div>
                        </div>
                    )}

                    {/* Radar spans the full width with a tall, roughly-square plot so
                        all 15 domain axis labels have room to breathe (a half-width,
                        default-height radar crushed them into overlap). */}
                    <div className={cn(cardVariants({ density: 'comfortable' }), 'space-y-tight')}>
                        <Heading level={3}>Maturity by domain</Heading>
                        {data.latest.answeredTotal === 0 ? (
                            // A just-started run has no answers yet, so every domain
                            // scores 0 and the radar would render as a bare dot. Show
                            // why instead — it fills in as answers arrive.
                            <p className="py-10 text-center text-sm text-content-muted">
                                No answers yet. Answer the assessment from the NIS2 step (or dispatch it to your team below) — the maturity radar populates as answers come in.
                            </p>
                        ) : (
                            <div className="mx-auto h-[520px] w-full max-w-3xl">
                                <RadarChart state={radarState} seriesIndex={2} maxValue={100} testId="nis2-gap-radar" ariaLabel="NIS2 maturity by domain" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-tight">
                        <Heading level={3}>Assessment history</Heading>
                        <DataTable data={data.history} columns={historyColumns} getRowId={(r) => r.id} data-testid="nis2-gap-history-table" />
                    </div>

                    {canWrite && data.history[0]?.source === 'STANDALONE' && data.history[0].status !== 'COMPLETED' && (
                        <Nis2AssignmentsPanel
                            tenantSlug={tenantSlug}
                            assessmentId={data.history[0].id}
                            onChanged={() => { void load(); }}
                        />
                    )}

                    <div className="space-y-tight">
                        <Heading level={3}>Prioritised gaps</Heading>
                        <DataTable data={data.latest.gaps} columns={gapColumns} getRowId={(r) => r.questionId} data-testid="nis2-gap-priority-table" />
                    </div>

                    {canWrite && suggestions.length > 0 && (
                        <div className="space-y-default">
                            <div className="flex items-center justify-between gap-compact flex-wrap">
                                <div>
                                    <Heading level={3}>Create these?</Heading>
                                    <p className="text-sm text-content-muted">Approve the remediations to create — nothing is written until you confirm.</p>
                                </div>
                                <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={applying || approvedCount === 0} id="nis2-gap-apply-btn">
                                    {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    Create {approvedCount > 0 ? `${approvedCount} ` : ''}selected
                                </Button>
                            </div>
                            <ul className="space-y-tight">
                                {suggestions.map((s) => (
                                    <li key={s.questionId} className={cn(cardVariants({ density: 'compact' }), 'flex items-start gap-default')}>
                                        <Checkbox
                                            checked={!!approved[s.questionId]}
                                            onCheckedChange={(v) => setApproved((prev) => ({ ...prev, [s.questionId]: !!v }))}
                                            aria-label={`Approve: ${s.title}`}
                                        />
                                        <div className="min-w-0 flex-1 space-y-tight">
                                            <div className="flex items-center gap-tight flex-wrap">
                                                <StatusBadge variant="info" size="sm">{kindLabel(s.kind)}</StatusBadge>
                                                <StatusBadge variant={critVariant(s.criticality)} size="sm">{s.criticality}</StatusBadge>
                                                {s.consequence === 'PERSONAL_LIABILITY' && <StatusBadge variant="error" size="sm">Personal liability</StatusBadge>}
                                                {s.fineExposure && <StatusBadge variant="warning" size="sm">Fine exposure</StatusBadge>}
                                                <span className="text-sm font-medium text-content-emphasis">{s.title}</span>
                                            </div>
                                            <p className="text-xs text-content-muted">{s.reason} · Legal basis: {s.legalBasis}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-xs text-content-subtle">
                        {NIS2_ATTRIBUTION}{' '}
                        <a href={NIS2_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-content-muted">source</a>
                    </p>
                </>
            )}

            <ConfirmDialog
                showModal={confirmOpen}
                setShowModal={(open) => {
                    if (typeof open === 'function') { if (!open(confirmOpen)) setConfirmOpen(false); }
                    else setConfirmOpen(open);
                }}
                title="Create the approved remediations?"
                description={`This creates ${approvedCount} item(s) — risks, controls, and tasks — from the gaps you approved. Existing NIS2 controls are re-used (a task is bound to them) rather than duplicated. This is reversible.`}
                confirmLabel="Create selected"
                onConfirm={async () => { setConfirmOpen(false); await handleApply(); }}
            />
        </div>
    );
}

// ─── Owner delegation panel (multi-respondent async collection, Prompt 2) ───

const RESPONDENT_ROLES: Array<{ role: string; label: string }> = [
    { role: 'CEO', label: 'CEO — scoping & governance' },
    { role: 'IT', label: 'IT — technical & cryptography' },
    { role: 'HR', label: 'HR — training & awareness' },
    { role: 'PROCUREMENT', label: 'Procurement — supply chain' },
    { role: 'ANYONE', label: 'General' },
];

interface AssignmentRow {
    id: string;
    respondentRole: string;
    assigneeUserId: string | null;
    status: string;
    questionIds: string[];
}

function Nis2AssignmentsPanel({
    tenantSlug,
    assessmentId,
    onChanged,
}: {
    tenantSlug: string;
    assessmentId: string;
    onChanged: () => void;
}) {
    const base = `/api/t/${tenantSlug}/gap-assessments/${assessmentId}/assignments`;
    const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
    const [picks, setPicks] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const loadAssignments = useCallback(async () => {
        try {
            const res = await fetch(base);
            if (res.ok) {
                const rows = (await res.json()) as AssignmentRow[];
                setAssignments(rows);
                setPicks(Object.fromEntries(rows.filter((r) => r.assigneeUserId).map((r) => [r.respondentRole, r.assigneeUserId as string])));
            }
        } catch { /* non-fatal */ }
    }, [base]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadAssignments(); }, [loadAssignments]);

    const byRole = useMemo(() => new Map(assignments.map((a) => [a.respondentRole, a])), [assignments]);
    const allSubmitted = assignments.length > 0 && assignments.every((a) => a.status === 'SUBMITTED');

    async function act(url: string, body: unknown, ok: string) {
        setBusy(true); setErr(null);
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } })?.error?.message ?? ok);
            await loadAssignments();
            onChanged();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-default">
            <div className="flex items-center justify-between gap-compact flex-wrap">
                <div>
                    <Heading level={3}>Assignments</Heading>
                    <p className="text-sm text-content-muted">
                        Route each part of the assessment to the person who can answer it. Each member sees only their questions.
                    </p>
                </div>
                <div className="flex items-center gap-tight">
                    <Button variant="secondary" disabled={busy} id="nis2-gap-dispatch-btn"
                        onClick={() => act(base, { roleToUserId: picks }, 'Dispatch failed')}>
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Dispatch
                    </Button>
                    <Button variant="secondary" disabled={busy || assignments.length === 0} id="nis2-gap-finalize-btn"
                        onClick={() => act(`${base}/finalize`, { force: !allSubmitted }, 'Finalize failed')}>
                        {allSubmitted ? 'Finalize' : 'Force-finalize'}
                    </Button>
                </div>
            </div>
            {err && <p className="text-sm text-content-error">{err}</p>}
            <ul className="space-y-tight">
                {RESPONDENT_ROLES.map(({ role, label }) => {
                    const a = byRole.get(role);
                    return (
                        <li key={role} className={cn(cardVariants({ density: 'compact' }), 'flex items-center gap-default flex-wrap')}>
                            <span className="text-sm font-medium text-content-emphasis w-full sm:w-56 sm:shrink-0">{label}</span>
                            <div className="min-w-0 flex-1">
                                <UserCombobox
                                    tenantSlug={tenantSlug}
                                    selectedId={picks[role] || null}
                                    onChange={(id) => setPicks((prev) => ({ ...prev, [role]: id ?? '' }))}
                                    forceDropdown
                                    matchTriggerWidth
                                    placeholder="Assign a member"
                                    className="w-full sm:w-64"
                                />
                            </div>
                            {a && (
                                <StatusBadge variant={a.status === 'SUBMITTED' ? 'success' : a.status === 'IN_PROGRESS' ? 'info' : 'neutral'} size="sm">
                                    {a.status} · {a.questionIds.length} Qs
                                </StatusBadge>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
