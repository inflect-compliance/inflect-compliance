'use client';
/* Routing note (Task 2): the PLAN lives under
 * /controls/{controlId}/tests/{planId} while its RUNS live at the
 * top-level /tests/runs/{runId}. That split route tree is deliberate
 * (moving it is riskier + out of scope) — the breadcrumbs below bridge
 * the hop so the control context never silently flips. */

import { formatDate } from '@/lib/format-date';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { TestPlanScheduleSection } from '@/components/TestPlanScheduleSection';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { CardHeader } from '@/components/ui/card-header';
import { KPIStat } from '@/components/ui/metric';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { Plus } from '@/components/ui/icons/nucleo';
import { useToast } from '@/components/ui/hooks/use-toast';
import { TestStepsEditor, type TestStepDraft, serializeSteps } from '@/app/t/[tenantSlug]/(app)/tests/_components/TestStepsEditor';

interface TestPlanDetail {
    id: string;
    name: string;
    description: string | null;
    method: string;
    frequency: string;
    status: string;
    nextDueAt: string | null;
    // Epic G-2 — automation scheduling fields. Returned by the
    // existing GET /tests/plans/:id; used by TestPlanScheduleSection
    // to render the cadence picker + next-run indicator.
    automationType: 'MANUAL' | 'SCRIPT' | 'INTEGRATION';
    schedule: string | null;
    scheduleTimezone: string | null;
    nextRunAt: string | null;
    controlId: string;
    owner?: { id: string; name: string | null; email: string } | null;
    createdBy?: { id: string; name: string | null; email: string } | null;
    steps: Array<{ id: string; sortOrder: number; instruction: string; expectedOutput: string | null }>;
    runs: Array<{
        id: string;
        status: string;
        result: string | null;
        executedAt: string | null;
        notes: string | null;
        executedBy?: { name: string | null; email: string } | null;
        _count?: { evidence: number };
    }>;
    _count?: { runs: number; steps: number };
    createdAt: string;
}

const buildFreqLabels = (t: (k: string) => string): Record<string, string> => ({
    AD_HOC: t('freq.adHoc'), DAILY: t('freq.daily'), WEEKLY: t('freq.weekly'),
    MONTHLY: t('freq.monthly'), QUARTERLY: t('freq.quarterly'), ANNUALLY: t('freq.annually'),
});
const RESULT_BADGE: Record<string, StatusBadgeVariant> = {
    PASS: 'success', FAIL: 'error', INCONCLUSIVE: 'warning',
};
const RUN_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    PLANNED: 'neutral', RUNNING: 'info', COMPLETED: 'success',
};
const buildFreqCbOptions = (freqLabels: Record<string, string>): ComboboxOption[] => Object.entries(freqLabels).map(([v, l]) => ({ value: v, label: l }));
const buildMethodOptions = (t: (key: string) => string): ComboboxOption[] => [{ value: 'MANUAL', label: t('automationTypeLabels.MANUAL') }, { value: 'AUTOMATED', label: t('automationTypeLabels.AUTOMATED') }];
// Audit Coherence S2 — ARCHIVED is the terminal "retired control
// test" state. Plans in ARCHIVED stay visible for historical audit
// but no new runs can be created. Distinct from soft-delete which
// removes the row from default queries entirely.
const buildPlanStatusOptions = (t: (key: string) => string): ComboboxOption[] => [
    { value: 'ACTIVE', label: t('planStatus.active') },
    { value: 'PAUSED', label: t('planStatus.paused') },
    { value: 'ARCHIVED', label: t('planStatus.archived') },
];
const PLAN_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    ACTIVE: 'success',
    PAUSED: 'warning',
    ARCHIVED: 'neutral',
};

export default function TestPlanDetailPage() {
    const params = useParams();
    const router = useRouter();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();
    const t = useTranslations('controls');
    const FREQ_LABELS = buildFreqLabels(t);
    const planId = params?.planId as string;

    // Epic 69 — canonical tenant-aware read. The endpoint returns the
    // plan + embedded steps[] + runs[] in one payload; we consume that
    // shape directly and refetch via mutate() after mutations.
    const { data: plan, isLoading, error, mutate } = useTenantSWR<TestPlanDetail>(`/tests/plans/${planId}`);

    // Second, conditional read so the breadcrumb can name the parent
    // control (the plan payload only carries controlId). Skips until the
    // plan resolves via the SWR null-key idiom.
    const { data: control } = useTenantSWR<{ id: string; code: string | null; name: string }>(
        plan ? `/controls/${plan.controlId}` : null,
    );

    const [editing, setEditing] = useState(false);
    const [creatingRun, setCreatingRun] = useState(false);
    const toast = useToast();

    const createRun = async () => {
        setCreatingRun(true);
        try {
            const res = await fetch(apiUrl(`/tests/plans/${planId}/runs`), { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            const run = await res.json();
            router.push(tenantHref(`/tests/runs/${run.id}`));
        } catch {
            toast.error(t('testPlan.runFailed'));
        } finally {
            setCreatingRun(false);
        }
    };

    if (isLoading) return <div className="p-12 text-center text-content-subtle animate-pulse">{t('testPlan.loading')}</div>;
    if (error) return <div className="p-12 text-center text-content-error">{t('testPlan.planNotFound')}</div>;
    if (!plan) return <div className="p-12 text-center text-content-subtle">{t('testPlan.planNotFoundBody')}</div>;

    // Task 2 — breadcrumbs bridge the plan(under /controls)↔run(under
    // /tests/runs) split so the control ancestor is always explicit.
    const breadcrumbs: BreadcrumbItem[] = [
        { label: t('detailPage.breadcrumbDashboard'), href: tenantHref('/dashboard') },
        { label: t('detailPage.breadcrumbControls'), href: tenantHref('/controls') },
        {
            label: control?.name ?? t('testPlan.crumbControl'),
            href: tenantHref(`/controls/${plan.controlId}`),
        },
        { label: plan.name },
    ];

    return (
        <div className="space-y-section animate-fadeIn">
            <Breadcrumbs items={breadcrumbs} />
            <BackAffordance />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Heading level={1} id="test-plan-title">{plan.name}</Heading>
                    <div className="flex items-center gap-tight mt-1 flex-wrap">
                        <StatusBadge variant={PLAN_STATUS_BADGE_VARIANT[plan.status] ?? 'neutral'} id="test-plan-status">
                            {plan.status}
                        </StatusBadge>
                        <span className="text-xs text-content-subtle">{FREQ_LABELS[plan.frequency] || plan.frequency}</span>
                        <span className="text-xs text-content-subtle">•</span>
                        <span className="text-xs text-content-subtle">{plan.method}</span>
                        {plan.nextDueAt && (
                            <>
                                <span className="text-xs text-content-subtle">•</span>
                                <span className={`text-xs ${new Date(plan.nextDueAt) < new Date() ? 'text-content-error font-semibold' : 'text-content-muted'}`}>
                                    {t('testPlan.due', { date: formatDate(plan.nextDueAt) })}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {permissions.canWrite && (
                    <div className="flex gap-tight">
                        <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)} id="edit-test-plan-btn">
                            {editing ? t('testPlan.cancel') : t('testPlan.edit')}
                        </Button>
                        {plan.status === 'ACTIVE' && (
                            <Button variant="primary" size="sm" onClick={createRun} disabled={creatingRun} id="create-test-run-btn">
                                {creatingRun ? '...' : t('testPlan.runTestNow')}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Form — extracted so its local draft state seeds from
                the plan via useState initializers on mount. Rendered only
                while `editing`, so every open is a fresh mount that
                re-seeds from the latest SWR data — no set-state-in-effect. */}
            {editing && permissions.canWrite && (
                <PlanEditForm
                    plan={plan}
                    onCancel={() => setEditing(false)}
                    onSaved={async () => { await mutate(); setEditing(false); }}
                />
            )}

            {/* Epic G-2 — schedule picker + next-run indicator */}
            <TestPlanScheduleSection
                planId={plan.id}
                initialAutomationType={plan.automationType}
                initialSchedule={plan.schedule}
                initialScheduleTimezone={plan.scheduleTimezone}
                initialNextRunAt={plan.nextRunAt}
                canEdit={permissions.canWrite}
                onSaved={() => void mutate()}
            />

            {/* Info Cards — Polish PR-2: KPIStat primitive. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                <div className={cardVariants({ density: 'compact' })}>
                    <KPIStat value={plan._count?.runs ?? 0} label={t('testPlan.totalRuns')} />
                </div>
                <div className={cardVariants({ density: 'compact' })}>
                    <KPIStat
                        value={plan.runs?.filter(r => r.result === 'PASS').length ?? 0}
                        label={t('testPlan.passed')}
                        tone="success"
                    />
                </div>
                <div className={cardVariants({ density: 'compact' })}>
                    <KPIStat
                        value={plan.runs?.filter(r => r.result === 'FAIL').length ?? 0}
                        label={t('testPlan.failed')}
                        tone="critical"
                    />
                </div>
                <div className={cardVariants({ density: 'compact' })}>
                    <KPIStat value={plan._count?.steps ?? 0} label={t('testPlan.steps')} />
                </div>
            </div>

            {/* Description */}
            {plan.description && (
                <div className={cardVariants({ density: 'compact' })}>
                    <Heading level={3} className="mb-2">{t('testPlan.description')}</Heading>
                    <p className="text-sm text-content-muted whitespace-pre-wrap">{plan.description}</p>
                </div>
            )}

            {/* Steps */}
            {plan.steps.length > 0 && (
                <div className={cardVariants({ density: 'compact' })}>
                    <CardHeader title={t('testPlan.testProcedure')} className="mb-3" />
                    <ol className="space-y-tight">
                        {plan.steps.map((step, i) => (
                            <li key={step.id} className="flex gap-compact text-sm">
                                <span className="w-6 h-6 rounded-full bg-[var(--brand-subtle)] text-[var(--brand-default)] text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {i + 1}
                                </span>
                                <div>
                                    <p className="text-content-default">{step.instruction}</p>
                                    {step.expectedOutput && (
                                        <p className="text-xs text-content-subtle mt-0.5">{t('testPlan.expected', { output: step.expectedOutput })}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Runs History */}
            <div className={cardVariants({ density: 'compact' })}>
                <div className="flex items-center justify-between mb-3">
                    <Heading level={3}>{t('testPlan.runHistory')}</Heading>
                    {permissions.canWrite && plan.status === 'ACTIVE' && (
                        <Button variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />} onClick={createRun} disabled={creatingRun}>
                            {creatingRun ? t('testPlan.creating') : t('testPlan.newRun')}
                        </Button>
                    )}
                </div>

                {plan.runs.length === 0 ? (
                    <p className="text-sm text-content-subtle">{t('testPlan.runsEmpty')}</p>
                ) : (
                    <div className="divide-y divide-border-default/50">
                        {plan.runs.map(run => (
                            <Link
                                key={run.id}
                                href={tenantHref(`/tests/runs/${run.id}`)}
                                className="flex items-center justify-between py-2.5 hover:bg-bg-muted/50 px-2 rounded transition group"
                                id={`test-run-link-${run.id}`}
                            >
                                <div className="flex items-center gap-compact">
                                    <StatusBadge variant={RUN_STATUS_BADGE[run.status] || 'neutral'} size="sm">
                                        {run.status}
                                    </StatusBadge>
                                    {run.result && (
                                        <StatusBadge variant={RESULT_BADGE[run.result] || 'neutral'} size="sm">
                                            {run.result}
                                        </StatusBadge>
                                    )}
                                    <span className="text-xs text-content-muted">
                                        {run.executedAt ? formatDate(run.executedAt) : t('testPlan.notExecuted')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-tight">
                                    {run.executedBy && (
                                        <span className="text-xs text-content-subtle">
                                            {run.executedBy.name || run.executedBy.email}
                                        </span>
                                    )}
                                    {run._count?.evidence ? (
                                        <span className="text-xs text-content-subtle">{t('testPlan.evidenceCount', { count: run._count.evidence })}</span>
                                    ) : null}
                                    <span className="text-xs text-content-subtle opacity-0 group-hover:opacity-100">→</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Meta */}
            <div className="text-xs text-content-subtle">
                {t('testPlan.createdBy', { date: formatDate(plan.createdAt), name: plan.createdBy?.name || plan.createdBy?.email || t('testPlan.unknown') })}
                {plan.owner && <> • {t('testPlan.owner', { name: plan.owner.name || plan.owner.email })}</>}
            </div>
        </div>
    );
}

/**
 * Edit form for a test plan. Kept as a child so its draft state seeds
 * from the `plan` prop via useState initializers — the parent renders it
 * ONLY while editing, so each open is a fresh mount that re-seeds from
 * the latest SWR data. That replaces the old fetch-into-setState effect
 * (and its react-hooks/set-state-in-effect disable) with the platform
 * "seed on mount" pattern.
 */
function PlanEditForm({
    plan,
    onCancel,
    onSaved,
}: {
    plan: TestPlanDetail;
    onCancel: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const t = useTranslations('controls');
    const apiUrl = useTenantApiUrl();
    const toast = useToast();
    const METHOD_OPTIONS = useMemo(() => buildMethodOptions(t), [t]);
    const PLAN_STATUS_OPTIONS = useMemo(() => buildPlanStatusOptions(t), [t]);
    const FREQ_CB_OPTIONS = useMemo(() => buildFreqCbOptions(buildFreqLabels(t)), [t]);

    const [editName, setEditName] = useState(plan.name);
    const [editDesc, setEditDesc] = useState(plan.description ?? '');
    const [editFreq, setEditFreq] = useState(plan.frequency);
    const [editMethod, setEditMethod] = useState(plan.method);
    const [editStatus, setEditStatus] = useState(plan.status);
    const [editSteps, setEditSteps] = useState<TestStepDraft[]>(
        (plan.steps ?? []).map((s) => ({ instruction: s.instruction, expectedOutput: s.expectedOutput ?? '' })),
    );
    const [saving, setSaving] = useState(false);

    const savePlan = async () => {
        setSaving(true);
        try {
            const res = await fetch(apiUrl(`/tests/plans/${plan.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editName,
                    description: editDesc || null,
                    frequency: editFreq,
                    method: editMethod,
                    status: editStatus,
                    steps: serializeSteps(editSteps),
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            await onSaved();
        } catch {
            toast.error(t('testPlan.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn(cardVariants({ density: 'compact' }), 'space-y-compact animate-fadeIn')}>
            <div>
                <label className="text-xs text-content-muted block mb-1">{t('testPlan.name')}</label>
                <input className="input w-full" value={editName} onChange={e => setEditName(e.target.value)} id="edit-plan-name" />
            </div>
            <div>
                <label className="text-xs text-content-muted block mb-1">{t('testPlan.description')}</label>
                <textarea className="input w-full h-20" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-compact">
                <div>
                    <label className="text-xs text-content-muted block mb-1">{t('testPlan.frequency')}</label>
                    <Combobox hideSearch selected={FREQ_CB_OPTIONS.find(o => o.value === editFreq) ?? null} setSelected={(opt) => setEditFreq(opt?.value ?? editFreq)} options={FREQ_CB_OPTIONS} matchTriggerWidth />
                </div>
                <div>
                    <label className="text-xs text-content-muted block mb-1">{t('testPlan.method')}</label>
                    <Combobox hideSearch selected={METHOD_OPTIONS.find(o => o.value === editMethod) ?? null} setSelected={(opt) => setEditMethod(opt?.value ?? editMethod)} options={METHOD_OPTIONS} matchTriggerWidth />
                </div>
                <div>
                    <label className="text-xs text-content-muted block mb-1">{t('testPlan.status')}</label>
                    <Combobox hideSearch id="edit-plan-status" selected={PLAN_STATUS_OPTIONS.find(o => o.value === editStatus) ?? null} setSelected={(opt) => setEditStatus(opt?.value ?? editStatus)} options={PLAN_STATUS_OPTIONS} matchTriggerWidth />
                </div>
            </div>
            <div>
                <label className="text-xs text-content-muted block mb-1">{t('testPlan.testProcedure')}</label>
                <TestStepsEditor steps={editSteps} onChange={setEditSteps} />
            </div>
            <div className="flex gap-tight">
                <Button variant="primary" size="sm" onClick={savePlan} disabled={saving} id="save-plan-changes-btn">
                    {saving ? t('testPlan.saving') : t('testPlan.saveChanges')}
                </Button>
                <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
                    {t('testPlan.cancel')}
                </Button>
            </div>
        </div>
    );
}
