'use client';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import type { CappedList } from '@/lib/list-backfill-cap';
import { TruncationBanner } from '@/components/ui/TruncationBanner';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageHeader } from '@/components/layout/PageHeader';
import { CardHeader } from '@/components/ui/card-header';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { Plus } from '@/components/ui/icons/nucleo';
import { NewAuditModal } from './NewAuditModal';
import { NewFindingModal } from './NewFindingModal';

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    PLANNED: 'neutral', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELLED: 'warning',
};
const RESULT_BADGE: Record<string, StatusBadgeVariant> = {
    NOT_TESTED: 'neutral', PASS: 'success', FAIL: 'error',
};

// listAudits → AuditRepository.list (auditListSelect). The lighter LIST row
// (distinct from the detail AuditDetail). List map callback stays untyped.
interface AuditListRow {
    id: string;
    title: string;
    status: string;
    _count: { checklist: number; findings: number };
}

interface AuditsClientProps {
    initialAudits: AuditListRow[];
    tenantSlug: string;
    /** feat/audit-cycle-unify — when set, the list is scoped to one cycle's
     *  fieldwork audits (?cycleId), and a "viewing cycle" banner shows. */
    cycleId?: string;
    /** True when NIS2 is an installed framework — gates the NIS2 Gap Assessment
     *  entry button (absent, not disabled, when false). */
    hasNis2: boolean;
    /** Gates the "New finding" affordance on the audit detail pane. */
    canWrite: boolean;
    translations: {
        title: string;
        listDescription: string;
        auditsCount: string;
        newAudit: string;
        auditTitle: string;
        auditors: string;
        scope: string;
        createAudit: string;
        cancel: string;
        planned: string;
        inProgress: string;
        completed: string;
        cancelled: string;
        notTested: string;
        pass: string;
        fail: string;
        checklist: string;
        findingsTab: string;
        selectAudit: string;
    };
}

// getAudit → AuditRepository.getById (full Audit + ordered checklist + findings).
interface AuditChecklistItemRow {
    id: string;
    prompt: string;
    result: string;
    notes: string | null;
}
interface AuditFindingRow {
    id: string;
    title: string;
    severity: string;
}
interface AuditDetail {
    id: string;
    title: string;
    status: string;
    auditScope: string | null;
    checklist: AuditChecklistItemRow[];
    findings: AuditFindingRow[];
}

/**
 * Client island for audits — handles master/detail, create form, checklist interactions.
 * Data is pre-fetched server-side and passed via props.
 */
export function AuditsClient({ initialAudits, tenantSlug, cycleId, hasNis2, canWrite, translations: t }: AuditsClientProps) {
    // `tx` covers strings not threaded through the server `translations` prop
    // (nav links, list counters) — mirrors the assets/risks island pattern.
    const tx = useTranslations('audits');
    const [selected, setSelected] = useState<AuditDetail | null>(null);
    const [isFindingOpen, setIsFindingOpen] = useState(false);

    // Modal-form follow-up — create-audit modal mounted off the list,
    // auto-opening on `?create=1` (the redirect target from
    // `/audits/new`). Mirrors NewVendorModal wiring.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const searchParams = useSearchParams();
    const router = useRouter();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(
                `/t/${tenantSlug}/audits${qs ? `?${qs}` : ''}`,
                { scroll: false },
            );
        }
        // First-mount only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;

    // PR-5 — API returns `{ rows, truncated }`; SSR initial wraps
    // with `truncated: false` (SSR cap < backfill cap).
    // feat/audit-cycle-unify — when scoped to a cycle, the SWR key carries
    // ?cycleId so the background revalidation stays filtered (not the whole
    // list); otherwise the static key seeds directly from the SSR payload.
    const auditsQuery = useTenantSWR<CappedList<AuditListRow>>(
        cycleId ? `${CACHE_KEYS.audits.list()}?cycleId=${cycleId}` : CACHE_KEYS.audits.list(),
        { fallbackData: { rows: initialAudits, truncated: false } },
    );
    const audits = auditsQuery.data?.rows ?? [];
    const truncated = auditsQuery.data?.truncated ?? false;

    const loadAudit = async (id: string) => {
        const res = await fetch(apiUrl(`/audits/${id}`));
        setSelected(await res.json());
    };

    const updateChecklist = async (itemId: string, result: string, notes: string = '') => {
        if (!selected) return;
        await fetch(apiUrl(`/audits/${selected.id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklistUpdates: [{ id: itemId, result, notes }] }) });
        loadAudit(selected.id);
    };

    const updateAuditStatus = async (status: string) => {
        if (!selected) return;
        await fetch(apiUrl(`/audits/${selected.id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        setSelected((s) => (s ? { ...s, status } : s));
        auditsQuery.mutate();
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { PLANNED: t.planned, IN_PROGRESS: t.inProgress, COMPLETED: t.completed, CANCELLED: t.cancelled };
        return map[status] || status;
    };

    const resultLabel = (result: string) => {
        const map: Record<string, string> = { NOT_TESTED: t.notTested, PASS: t.pass, FAIL: t.fail };
        return map[result] || result;
    };

    const resultOptions = useMemo<ComboboxOption[]>(
        () => [
            { value: 'NOT_TESTED', label: t.notTested },
            { value: 'PASS', label: t.pass },
            { value: 'FAIL', label: t.fail },
        ],
        [t.notTested, t.pass, t.fail],
    );

    return (
        <>
            <PageHeader
                // The Internal Audit action row (6 pills + New Audit) is wide
                // enough to wrap onto its own header line; ml-auto keeps it
                // right-aligned there instead of landing left under justify-between.
                actionsClassName="ml-auto"
                breadcrumbs={[
                    { label: tx('crumb.dashboard'), href: `/t/${tenantSlug}/dashboard` },
                    { label: t.title },
                ]}
                title={t.title}
                description={t.listDescription || undefined}
                actions={
                    <div className="flex flex-wrap gap-tight">
                        <Link
                            href={`/t/${tenantSlug}/frameworks`}
                            className={cn(buttonVariants({ variant: 'secondary' }))}
                            id="audits-frameworks-link"
                        >
                            {tx('nav.frameworks')}
                        </Link>
                        {/* Scans (security-testing / scanner ingestion) moved off
                            the primary nav onto the Audit surface — scan findings
                            are audit evidence, so the entry-point belongs beside
                            Frameworks/Findings here. */}
                        <Link
                            href={`/t/${tenantSlug}/security-testing`}
                            className={cn(buttonVariants({ variant: 'secondary' }))}
                            id="audits-scans-link"
                        >
                            {tx('nav.scans')}
                        </Link>
                        {/* Findings moved off the Tests page header onto
                            the Audit surface — findings are raised and
                            tracked against audit cycles, so they belong
                            next to Frameworks/Clauses here. */}
                        <Link
                            href={`/t/${tenantSlug}/findings`}
                            className={cn(buttonVariants({ variant: 'secondary' }))}
                            id="findings-link-btn"
                        >
                            {t.findingsTab}
                        </Link>
                        {/* Incidents (NIS2 Article 23) is a subpage of Internal
                            Audit — reached via this text button. */}
                        <Link
                            href={`/t/${tenantSlug}/incidents`}
                            className={cn(buttonVariants({ variant: 'secondary' }))}
                            id="audits-incidents-link"
                        >
                            {tx('nav.incidents')}
                        </Link>
                        {/* NIS2 Gap Assessment lifecycle — shown ONLY when NIS2
                            is an installed framework (absent, not disabled,
                            otherwise). Navigational entry to the lifecycle home;
                            bare noun label, no Plus glyph. */}
                        {hasNis2 && (
                            <Link
                                href={`/t/${tenantSlug}/audits/nis2-gap`}
                                className={cn(buttonVariants({ variant: 'secondary' }))}
                                id="audits-nis2-gap-link"
                            >
                                {tx('nav.nis2Gap')}
                            </Link>
                        )}
                        {/* Business Continuity (BIA) sits beside Incidents — NIS2/DORA
                            pair incident handling with continuity as sibling
                            operational-resilience obligations. */}
                        <Link
                            href={`/t/${tenantSlug}/audits/business-continuity`}
                            className={cn(buttonVariants({ variant: 'secondary' }))}
                            id="audits-business-continuity-link"
                        >
                            {tx('nav.businessContinuity')}
                        </Link>
                        <Button variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />} onClick={() => setIsCreateOpen(true)} id="new-audit-btn">{t.newAudit}</Button>
                    </div>
                }
            />

            <TruncationBanner truncated={truncated} />

            {/* Audit lifecycle — the PRIMARY path into the cycle → pack →
                readiness → share → findings → remediate flow. The pills in
                the header (Frameworks / Scans / Incidents / NIS2 / BCM) are
                tangential entry points; this band is where an audit starts. */}
            <section className={cn(cardVariants(), 'space-y-default')} aria-labelledby="audit-lifecycle-heading" id="audit-lifecycle">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-compact">
                    <div>
                        <Heading level={2} id="audit-lifecycle-heading">{tx('hub.lifecycleTitle')}</Heading>
                        <p className="text-sm text-content-muted">{tx('hub.lifecycleSubtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-tight">
                        <Link href={`/t/${tenantSlug}/audits/cycles`} className={cn(buttonVariants({ variant: 'secondary' }))} id="audits-cycles-link">
                            {tx('hub.cycles')}
                        </Link>
                        <Link href={`/t/${tenantSlug}/audits/readiness`} className={cn(buttonVariants({ variant: 'secondary' }))} id="audits-readiness-link">
                            {tx('hub.readiness')}
                        </Link>
                        <Link href={`/t/${tenantSlug}/audits/auditor`} className={cn(buttonVariants({ variant: 'secondary' }))} id="audits-auditor-link">
                            {tx('hub.auditorPortal')}
                        </Link>
                        <Link href={`/t/${tenantSlug}/audits/auditors`} className={cn(buttonVariants({ variant: 'secondary' }))} id="audits-auditors-manage-link">
                            {tx('hub.auditorManagement')}
                        </Link>
                    </div>
                </div>

                <div className="space-y-tight">
                    <div>
                        <Heading level={3}>{tx('hub.startTitle')}</Heading>
                        <p className="text-sm text-content-muted">{tx('hub.startSubtitle')}</p>
                    </div>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-tight">
                        {[
                            { title: tx('hub.step1Title'), desc: tx('hub.step1Desc'), href: `/t/${tenantSlug}/audits/cycles` },
                            { title: tx('hub.step2Title'), desc: tx('hub.step2Desc'), href: `/t/${tenantSlug}/audits/cycles` },
                            { title: tx('hub.step3Title'), desc: tx('hub.step3Desc'), href: `/t/${tenantSlug}/audits/cycles` },
                            { title: tx('hub.step4Title'), desc: tx('hub.step4Desc'), href: `/t/${tenantSlug}/audits/cycles` },
                            { title: tx('hub.step5Title'), desc: tx('hub.step5Desc'), href: `/t/${tenantSlug}/findings` },
                            { title: tx('hub.step6Title'), desc: tx('hub.step6Desc'), href: `/t/${tenantSlug}/tasks` },
                        ].map((step, i) => (
                            <li key={i}>
                                <Link
                                    href={step.href}
                                    id={`audit-step-${i + 1}`}
                                    className={cn(
                                        cardVariants({ density: 'compact' }),
                                        'flex items-start gap-compact hover:bg-bg-muted/50 hover:border-border-emphasis transition h-full',
                                    )}
                                >
                                    <span
                                        className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-elevated text-sm font-semibold text-content-default"
                                        aria-label={tx('hub.stepLabel', { n: i + 1 })}
                                    >
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-content-default">{step.title}</span>
                                        <span className="block text-xs text-content-subtle mt-0.5">{step.desc}</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* feat/audit-cycle-unify — scoped-to-cycle context banner. */}
            {cycleId && (
                <div
                    className="flex items-center justify-between rounded-md border border-border-emphasis bg-bg-info/10 px-3 py-2 text-sm"
                    data-testid="audits-cycle-filter-banner"
                >
                    <span className="text-content-default">{tx('hub.cycleFilterActive')}</span>
                    <Link href={`/t/${tenantSlug}/audits`} className="text-xs text-content-muted underline underline-offset-2" id="audits-clear-cycle-filter">
                        {tx('hub.clearCycleFilter')}
                    </Link>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-default">
                <div className="space-y-tight">
                    {audits.map((a) => (
                        <button key={a.id} onClick={() => loadAudit(a.id)}
                            className={cn(cardVariants({ density: 'compact' }), 'w-full text-left hover:bg-bg-muted/50 transition', selected?.id === a.id && 'ring-2 ring-[var(--ring)]')}>
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{a.title}</span>
                                <StatusBadge variant={STATUS_BADGE[a.status]}>{statusLabel(a.status)}</StatusBadge>
                            </div>
                            <p className="text-xs text-content-subtle mt-1">{tx('list.itemsCount', { count: a._count?.checklist || 0 })} · {a._count?.findings || 0} {t.findingsTab.toLowerCase()}</p>
                        </button>
                    ))}
                </div>

                <div className="lg:col-span-2">
                    {selected ? (
                        <div className={cn(cardVariants(), 'animate-fadeIn space-y-default')}>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-compact">
                                <Heading level={2}>{selected.title}</Heading>
                                <div className="flex flex-wrap gap-tight">
                                    {selected.status === 'PLANNED' && <Button variant="secondary" size="sm" onClick={() => updateAuditStatus('IN_PROGRESS')}>{t.inProgress}</Button>}
                                    {selected.status === 'IN_PROGRESS' && <Button variant="secondary" size="sm" onClick={() => updateAuditStatus('COMPLETED')}>{t.completed}</Button>}
                                </div>
                            </div>
                            {selected.auditScope && <p className="text-sm text-content-muted">{selected.auditScope}</p>}

                            <div>
                                <CardHeader title={`${t.checklist} (${selected.checklist?.length || 0})`} className="mb-3" />
                                <div className="space-y-tight">
                                    {selected.checklist?.map((item) => (
                                        <div key={item.id} className="flex flex-col sm:flex-row items-start gap-compact p-3 border border-border-default/50 rounded-lg">
                                            <Combobox
                                                hideSearch
                                                options={resultOptions}
                                                selected={resultOptions.find(o => o.value === item.result) ?? null}
                                                setSelected={(opt) => opt && updateChecklist(item.id, opt.value)}
                                                matchTriggerWidth
                                                buttonProps={{ className: 'w-full sm:w-auto text-xs' }}
                                                aria-label={tx('list.resultFor', { prompt: item.prompt })}
                                                caret
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm text-content-default">{item.prompt}</p>
                                                {item.notes && <p className="text-xs text-content-subtle mt-1">{item.notes}</p>}
                                            </div>
                                            {/* R8-PR5 — checklist result restates the Combobox above it. Demote to `tone="subtle"` so the row reads as one state signal, not two competing pills. */}
                                            <StatusBadge tone="subtle" variant={RESULT_BADGE[item.result]}>{resultLabel(item.result)}</StatusBadge>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between gap-compact">
                                    <Heading level={3}>{t.findingsTab} ({selected.findings?.length || 0})</Heading>
                                    {canWrite && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={<Plus className="-ml-0.5 -mr-2.5" />}
                                            onClick={() => setIsFindingOpen(true)}
                                            id="new-audit-finding-btn"
                                        >
                                            {tx('findingModal.trigger')}
                                        </Button>
                                    )}
                                </div>
                                {selected.findings?.length > 0 && selected.findings.map((f) => (
                                    <div key={f.id} className="p-3 border border-border-default/50 rounded-lg mb-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">{f.title}</span>
                                            <StatusBadge variant={f.severity === 'CRITICAL' ? 'error' : f.severity === 'HIGH' ? 'warning' : 'info'}>{f.severity}</StatusBadge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={cn(cardVariants({ density: 'spacious' }), 'text-center text-content-subtle')}>{t.selectAudit}</div>
                    )}
                </div>
            </div>

            <NewAuditModal
                open={isCreateOpen}
                setOpen={setIsCreateOpen}
                tenantSlug={tenantSlug}
                onCreated={(a) => loadAudit(a.id)}
                labels={{
                    auditTitle: t.auditTitle,
                    auditors: t.auditors,
                    scope: t.scope,
                    cancel: t.cancel,
                    createAudit: t.createAudit,
                    newAudit: t.newAudit,
                }}
            />

            {selected && (
                <NewFindingModal
                    open={isFindingOpen}
                    setOpen={setIsFindingOpen}
                    auditId={selected.id}
                    apiUrl={apiUrl}
                    onCreated={() => loadAudit(selected.id)}
                />
            )}
        </>
    );
}
