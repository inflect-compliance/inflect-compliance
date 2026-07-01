'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/layout/EntityDetailLayout';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { MetaStrip, type MetaItem } from '@/components/ui/meta-strip';
import { IncidentBiaContext } from '@/components/bia/IncidentBiaContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Heading } from '@/components/ui/typography';
import { formatDateTime } from '@/lib/format-date';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';
import { PHASE_ORDER } from '@/lib/incidents/deadlines';
import {
    containmentRunbookFor,
    INCIDENT_RESPONSE_RACI,
    FORENSIC_EVIDENCE_CHECKLIST,
} from '@/data/incident-containment';
import { SEVERITY_LABELS, PHASE_LABELS, INCIDENT_TYPE_LABELS } from '../filter-defs';

// ─── Types (the GET /incidents/{id} payload) ───────────────────────
interface IncidentNotification {
    id: string;
    kind: 'EARLY_WARNING_24H' | 'DETAILED_72H' | 'FINAL_1MONTH';
    dueAt: string;
    status: 'PENDING' | 'DUE' | 'OVERDUE' | 'SUBMITTED' | 'NOT_REQUIRED';
    submittedAt: string | null;
    submissionRef: string | null;
}
interface TimelineEntry {
    id: string;
    at: string;
    actorUserId: string | null;
    entry: string;
    phaseAtTime: string;
}
interface IncidentDetail {
    id: string;
    reference: string;
    title: string;
    description: string;
    severity: keyof typeof SEVERITY_LABELS;
    phase: keyof typeof PHASE_LABELS;
    incidentType: string;
    detectedAt: string;
    reportable: boolean;
    reportedAt: string | null;
    ownerUserId: string | null;
    linkedControlIds: string[];
    completedContainmentSteps: string[];
    notifications: IncidentNotification[];
    timeline: TimelineEntry[];
    evidenceLinks: IncidentEvidenceLink[];
}
interface IncidentEvidenceLink {
    id: string;
    evidenceId: string;
    forensicCategory: string | null;
    evidence: { id: string; title: string; type: string; status: string } | null;
}

const forensicCategoryOptions = FORENSIC_EVIDENCE_CHECKLIST.map((c) => ({
    value: c.key,
    label: c.label,
}));

const SEVERITY_TONE: Record<string, StatusBadgeVariant> = {
    LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error',
};
const DEADLINE_TONE: Record<string, StatusBadgeVariant> = {
    PENDING: 'neutral', DUE: 'warning', OVERDUE: 'error', SUBMITTED: 'success', NOT_REQUIRED: 'neutral',
};
// The three Article 23 notification kinds, in deadline order.
const KIND_LABELS: Record<IncidentNotification['kind'], string> = {
    EARLY_WARNING_24H: '24-hour early warning',
    DETAILED_72H: '72-hour detailed report',
    FINAL_1MONTH: '1-month final report',
};
const KIND_ORDER: IncidentNotification['kind'][] = [
    'EARLY_WARNING_24H',
    'DETAILED_72H',
    'FINAL_1MONTH',
];

type TabKey = 'overview' | 'timeline' | 'controls';

function countdown(dueAt: string, now: number): string {
    const ms = new Date(dueAt).getTime() - now;
    const overdue = ms < 0;
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3_600_000);
    const m = Math.floor((abs % 3_600_000) / 60_000);
    const body = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
    return overdue ? `${body} overdue` : `${body} left`;
}

export default function IncidentDetailPage() {
    const params = useParams<{ tenantSlug: string; incidentId: string }>();
    const tenantSlug = params.tenantSlug;
    const incidentId = params.incidentId;
    const now = useHydratedNow();
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const query = useTenantSWR<IncidentDetail>(CACHE_KEYS.incidents.detail(incidentId));
    const incident = query.data;

    // ─── Action helpers (POST → mutate) ───
    // Tenant-scoped API base — keep the `/api/t/<slug>` prefix out of the
    // literal fetch call (tenant-isolation guard) and centralise it here.
    const apiUrl = (path: string) => `/api/t/${tenantSlug}/incidents/${incidentId}${path}`;
    // Tenant-root API base (for cross-resource fetches like the evidence
    // list) — keeps the `/api/` literal out of the fetch call site.
    const tenantApiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const post = async (
        path: string,
        body: unknown,
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
    ) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(path), {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Action failed');
            await query.mutate();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Action failed');
            return false;
        } finally {
            setBusy(false);
        }
    };

    // Load the tenant's evidence records into the picker, then open the
    // link-evidence modal.
    const openEvidenceModal = async () => {
        setSelectedEvidenceId('');
        setSelectedForensicCategory('');
        setEvidenceOpen(true);
        try {
            const res = await fetch(tenantApiUrl('/evidence'));
            if (!res.ok) return;
            const rows = (await res.json()) as Array<{ id: string; title: string }>;
            const list = Array.isArray(rows) ? rows : [];
            setEvidenceOptions(list.map((e) => ({ value: e.id, label: e.title })));
        } catch {
            /* non-fatal — the picker just shows no options */
        }
    };

    // ─── Submit-notification modal state ───
    const [submitKind, setSubmitKind] = useState<IncidentNotification['kind'] | null>(null);
    const [reportText, setReportText] = useState('');
    const [submissionRef, setSubmissionRef] = useState('');
    const [timelineOpen, setTimelineOpen] = useState(false);
    const [timelineEntry, setTimelineEntry] = useState('');
    const [reportableOpen, setReportableOpen] = useState(false);
    // ─── Link-evidence modal state ───
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [evidenceOptions, setEvidenceOptions] = useState<{ value: string; label: string }[]>([]);
    const [selectedEvidenceId, setSelectedEvidenceId] = useState('');
    const [selectedForensicCategory, setSelectedForensicCategory] = useState('');

    const tabs: EntityDetailTab<TabKey>[] = useMemo(
        () => [
            { key: 'overview', label: 'Overview' },
            { key: 'timeline', label: 'Timeline', count: incident?.timeline.length },
            { key: 'controls', label: 'Controls', count: incident?.linkedControlIds.length },
        ],
        [incident?.timeline.length, incident?.linkedControlIds.length],
    );

    if (!incident) {
        return (
            <EntityDetailLayout<TabKey>
                back={{ smart: true }}
                breadcrumbs={[
                    { label: 'Incidents', href: `/t/${tenantSlug}/incidents` },
                    { label: 'Incident' },
                ]}
                title="Incident"
                loading={query.isLoading}
                error={query.error ? 'Failed to load incident' : null}
            >
                <div />
            </EntityDetailLayout>
        );
    }

    const currentPhaseIdx = PHASE_ORDER.indexOf(incident.phase);

    return (
        <EntityDetailLayout<TabKey>
            back={{ smart: true }}
            breadcrumbs={[
                { label: 'Incidents', href: `/t/${tenantSlug}/incidents` },
                { label: incident.reference },
            ]}
            title={`[${incident.reference}] ${incident.title}`}
            meta={
                <MetaStrip
                    items={[
                        {
                            kind: 'status',
                            label: 'Severity',
                            value: SEVERITY_LABELS[incident.severity] ?? incident.severity,
                            variant: SEVERITY_TONE[incident.severity] ?? 'neutral',
                        },
                        {
                            kind: 'text',
                            label: 'Type',
                            value:
                                INCIDENT_TYPE_LABELS[
                                    incident.incidentType as keyof typeof INCIDENT_TYPE_LABELS
                                ] ?? incident.incidentType,
                        },
                        {
                            kind: 'text',
                            label: 'Phase',
                            value: PHASE_LABELS[incident.phase] ?? incident.phase,
                        },
                        {
                            kind: 'text',
                            label: 'Detected',
                            value: formatDateTime(incident.detectedAt),
                        },
                    ] satisfies MetaItem[]}
                />
            }
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {error && (
                <div className="mb-default rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                    {error}
                </div>
            )}

            {activeTab === 'overview' && (
                <div className="space-y-section">
                    {/* BIA recovery-deadline context — MTPD of any process this
                        incident's linked controls protect (renders nothing if none). */}
                    <IncidentBiaContext incidentId={incidentId} />
                    {/* Not-legal-advice disclaimer — prominent. */}
                    <Card elevation="inset" className="px-4 py-3 text-sm text-content-muted">
                        <strong className="text-content-default">Not legal advice.</strong>{' '}
                        The NIS2 Article 23 reportability threshold and the 24h / 72h / 1-month
                        deadlines below are operational aids. Your DPO/legal team owns the actual
                        reporting determination.
                    </Card>

                    {/* 7-phase response tracker (the seven-phase NIS2 flow + CLOSED). */}
                    <section className="space-y-default">
                        <Heading level={2}>Response phase</Heading>
                        <ol className="flex flex-wrap gap-tight" aria-label="7-phase incident response tracker">
                            {PHASE_ORDER.map((p, idx) => {
                                const done = idx < currentPhaseIdx;
                                const current = idx === currentPhaseIdx;
                                return (
                                    <li key={p} className="flex items-center gap-tight">
                                        <StatusBadge variant={current ? 'info' : done ? 'success' : 'neutral'}>
                                            {idx + 1}. {PHASE_LABELS[p]}
                                        </StatusBadge>
                                    </li>
                                );
                            })}
                        </ol>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy || incident.phase === 'CLOSED'}
                            onClick={() => post('/advance-phase', {})}
                            id="advance-phase-btn"
                        >
                            Advance phase
                        </Button>
                    </section>

                    {/* Containment runbook — per incident-type checklist. */}
                    {(() => {
                        const runbook = containmentRunbookFor(incident.incidentType);
                        if (!runbook) return null;
                        const done = new Set(incident.completedContainmentSteps);
                        return (
                            <section className="space-y-default" aria-label="Incident containment runbook">
                                <Heading level={2}>Containment runbook</Heading>
                                <p className="text-xs text-content-muted">
                                    First-response containment steps for a {INCIDENT_TYPE_LABELS[
                                        incident.incidentType as keyof typeof INCIDENT_TYPE_LABELS
                                    ] ?? incident.incidentType} incident. Operational guidance, not legal
                                    advice. Completing a step records it on the timeline.
                                </p>
                                <ul className="space-y-tight">
                                    {runbook.steps.map((step) => {
                                        const checked = done.has(step.key);
                                        return (
                                            <li key={step.key} className="flex items-start gap-tight">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={checked}
                                                    disabled={busy}
                                                    onChange={(e) =>
                                                        post('/containment-step', {
                                                            stepKey: step.key,
                                                            completed: e.target.checked,
                                                        })
                                                    }
                                                    aria-label={step.label}
                                                />
                                                <span
                                                    className={
                                                        checked
                                                            ? 'text-sm text-content-muted line-through'
                                                            : 'text-sm text-content-default'
                                                    }
                                                >
                                                    {step.label}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })()}

                    {/* Article 23 notification deadlines. */}
                    <section className="space-y-default">
                        <Heading level={2}>Article 23 notification deadlines</Heading>
                        {!incident.reportable ? (
                            <div className="rounded-lg border border-border-subtle p-4 space-y-default">
                                <p className="text-sm text-content-muted">
                                    This incident is not yet marked reportable. Marking it reportable is a
                                    human determination (not automatic, not legal advice) that starts the
                                    24h / 72h / 1-month clocks.
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setReportableOpen(true)}
                                    id="mark-reportable-btn"
                                >
                                    Mark reportable
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-default">
                                {KIND_ORDER.map((kind) => {
                                    const n = incident.notifications.find((x) => x.kind === kind);
                                    if (!n) return null;
                                    return (
                                        <div
                                            key={kind}
                                            className="flex flex-wrap items-center justify-between gap-default rounded-lg border border-border-subtle px-4 py-3"
                                        >
                                            <div className="space-y-tight">
                                                <div className="font-medium text-content-emphasis">
                                                    {KIND_LABELS[kind]}
                                                </div>
                                                <div className="text-xs text-content-muted">
                                                    Due {formatDateTime(n.dueAt)}
                                                    {n.status !== 'SUBMITTED' && now != null && (
                                                        <span
                                                            className={
                                                                n.status === 'OVERDUE'
                                                                    ? 'ml-2 font-semibold text-content-error'
                                                                    : 'ml-2 text-content-warning'
                                                            }
                                                        >
                                                            {countdown(n.dueAt, now.getTime())}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-tight">
                                                <StatusBadge variant={DEADLINE_TONE[n.status] ?? 'neutral'}>
                                                    {n.status}
                                                </StatusBadge>
                                                {n.status !== 'SUBMITTED' && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setSubmitKind(kind);
                                                            setReportText('');
                                                            setSubmissionRef('');
                                                        }}
                                                    >
                                                        Submit
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Jurisdiction / authority. */}
                    <section className="space-y-default">
                        <Heading level={2}>Notification authority</Heading>
                        <p className="text-sm text-content-muted">
                            The competent CSIRT / authority you notify is jurisdiction-specific
                            (e.g. CCB in Belgium, NCSC-NL in the Netherlands, BSI in Germany).
                            Configure it under{' '}
                            <Link
                                href={`/t/${tenantSlug}/admin/settings`}
                                className="text-content-link underline"
                            >
                                tenant security settings
                            </Link>
                            .
                        </p>
                    </section>

                    {/* Forensic evidence collection checklist. */}
                    <section className="space-y-default" aria-label="Forensic evidence checklist">
                        <div className="flex items-center justify-between">
                            <Heading level={2}>Forensic evidence</Heading>
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={openEvidenceModal}
                                id="link-evidence-btn"
                            >
                                Link evidence
                            </Button>
                        </div>
                        <p className="text-xs text-content-muted">
                            Capture forensic evidence for each category and link the real Evidence
                            records so the incident stays audit-ready.
                        </p>
                        <ul className="space-y-tight">
                            {FORENSIC_EVIDENCE_CHECKLIST.map((cat) => {
                                const links = incident.evidenceLinks.filter(
                                    (l) => l.forensicCategory === cat.key,
                                );
                                return (
                                    <li
                                        key={cat.key}
                                        className="flex flex-wrap items-center justify-between gap-default rounded-lg border border-border-subtle px-4 py-2"
                                    >
                                        <div className="space-y-tight">
                                            <div className="text-sm font-medium text-content-emphasis">
                                                {cat.label}
                                            </div>
                                            <div className="text-xs text-content-muted">{cat.hint}</div>
                                        </div>
                                        <StatusBadge variant={links.length > 0 ? 'success' : 'neutral'}>
                                            {links.length > 0 ? `${links.length} linked` : 'none'}
                                        </StatusBadge>
                                    </li>
                                );
                            })}
                        </ul>
                        {incident.evidenceLinks.length > 0 && (
                            <ul className="space-y-tight">
                                {incident.evidenceLinks.map((l) => (
                                    <li
                                        key={l.id}
                                        className="flex items-center justify-between gap-default text-sm"
                                    >
                                        <Link
                                            href={`/t/${tenantSlug}/evidence`}
                                            className="text-content-link underline"
                                        >
                                            {l.evidence?.title ?? l.evidenceId}
                                        </Link>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() =>
                                                post('/evidence', { evidenceId: l.evidenceId }, 'DELETE')
                                            }
                                        >
                                            Unlink
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Link
                            href={`/t/${tenantSlug}/evidence`}
                            className="text-content-link underline text-xs"
                        >
                            Open the evidence register →
                        </Link>
                    </section>

                    {/* Incident-response roles (informational RACI). */}
                    <section className="space-y-default" aria-label="Incident response roles">
                        <Heading level={2}>Incident response roles</Heading>
                        <ul className="space-y-tight">
                            {INCIDENT_RESPONSE_RACI.map((r) => (
                                <li key={r.role} className="flex flex-wrap items-baseline gap-tight text-sm">
                                    <span className="font-medium text-content-emphasis">{r.role}</span>
                                    <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs font-semibold text-content-muted">
                                        {r.raci}
                                    </span>
                                    <span className="text-content-muted">{r.responsibility}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <p className="text-sm text-content-muted">{incident.description}</p>
                </div>
            )}

            {activeTab === 'timeline' && (
                <div className="space-y-section">
                    <div className="flex items-center justify-between">
                        <Heading level={2}>Incident timeline</Heading>
                        <Button variant="secondary" size="sm" onClick={() => setTimelineOpen(true)} disabled={busy}>
                            Add entry
                        </Button>
                    </div>
                    <ol className="space-y-default">
                        {incident.timeline.map((t) => (
                            <li key={t.id} className="rounded-lg border border-border-subtle px-4 py-3">
                                <div className="flex items-center justify-between gap-default">
                                    <span className="text-xs text-content-muted">{formatDateTime(t.at)}</span>
                                    <StatusBadge variant="neutral">
                                        {PHASE_LABELS[t.phaseAtTime as keyof typeof PHASE_LABELS] ?? t.phaseAtTime}
                                    </StatusBadge>
                                </div>
                                <p className="mt-1 text-sm text-content-default">{t.entry}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {activeTab === 'controls' && (
                <div className="space-y-section">
                    <Heading level={2}>Linked Art.21(2) controls</Heading>
                    {incident.linkedControlIds.length === 0 ? (
                        <p className="text-sm text-content-muted">
                            No controls linked yet. Link the Art.21(2) controls this incident implicates
                            from the control detail page or via the API.
                        </p>
                    ) : (
                        <ul className="space-y-tight">
                            {incident.linkedControlIds.map((cid) => (
                                <li key={cid}>
                                    <Link
                                        href={`/t/${tenantSlug}/controls/${cid}`}
                                        className="text-content-link underline text-sm"
                                    >
                                        {cid}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* ─── Submit-notification modal ─── */}
            {submitKind && (
                <Modal showModal setShowModal={(v) => { if (!v) setSubmitKind(null); }} size="lg" title="File notification">
                    <Modal.Header title={`File ${KIND_LABELS[submitKind]}`} description="Record the report you filed with the competent authority." />
                    <Modal.Body>
                        <div className="space-y-default">
                            <FormField label="Report text" required>
                                <Textarea
                                    rows={5}
                                    value={reportText}
                                    onChange={(e) => setReportText(e.target.value)}
                                    placeholder="The report submitted to the authority"
                                />
                            </FormField>
                            <FormField label="Authority case reference" hint="The reference the authority returned, if any.">
                                <Input
                                    type="text"
                                    value={submissionRef}
                                    onChange={(e) => setSubmissionRef(e.target.value)}
                                    placeholder="e.g. CCB-2026-0042"
                                />
                            </FormField>
                        </div>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" onClick={() => setSubmitKind(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || reportText.trim().length === 0}
                            onClick={async () => {
                                const ok = await post('/notifications', {
                                    kind: submitKind,
                                    reportText,
                                    submissionRef: submissionRef || undefined,
                                });
                                if (ok) setSubmitKind(null);
                            }}
                        >
                            Submit report
                        </Button>
                    </Modal.Actions>
                </Modal>
            )}

            {/* ─── Add timeline entry modal ─── */}
            {timelineOpen && (
                <Modal showModal setShowModal={(v) => { if (!v) setTimelineOpen(false); }} size="md" title="Add timeline entry">
                    <Modal.Header title="Add timeline entry" description="Record an action or observation on this incident." />
                    <Modal.Body>
                        <FormField label="Entry" required>
                            <Textarea
                                rows={4}
                                value={timelineEntry}
                                onChange={(e) => setTimelineEntry(e.target.value)}
                                placeholder="What happened"
                            />
                        </FormField>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" onClick={() => setTimelineOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || timelineEntry.trim().length === 0}
                            onClick={async () => {
                                const ok = await post('/timeline', { entry: timelineEntry });
                                if (ok) {
                                    setTimelineEntry('');
                                    setTimelineOpen(false);
                                }
                            }}
                        >
                            Add entry
                        </Button>
                    </Modal.Actions>
                </Modal>
            )}

            {/* ─── Mark-reportable confirm modal ─── */}
            {reportableOpen && (
                <Modal showModal setShowModal={(v) => { if (!v) setReportableOpen(false); }} size="md" title="Mark reportable">
                    <Modal.Header
                        title="Mark this incident reportable?"
                        description="This is a human determination — not automatic and not legal advice."
                    />
                    <Modal.Body>
                        <p className="text-sm text-content-muted">
                            Marking this incident reportable under NIS2 Article 23 starts the
                            24-hour early-warning, 72-hour detailed-report, and 1-month final-report
                            deadline clocks (derived from the detection time). Confirm only if your
                            DPO/legal has determined the incident meets the significant-impact
                            threshold.
                        </p>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" onClick={() => setReportableOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                                const ok = await post('/reportable', { reportable: true });
                                if (ok) setReportableOpen(false);
                            }}
                        >
                            Mark reportable
                        </Button>
                    </Modal.Actions>
                </Modal>
            )}

            {/* ─── Link forensic evidence modal ─── */}
            {evidenceOpen && (
                <Modal showModal setShowModal={(v) => { if (!v) setEvidenceOpen(false); }} size="md" title="Link evidence">
                    <Modal.Header
                        title="Link forensic evidence"
                        description="Attach an existing tenant Evidence record to this incident."
                    />
                    <Modal.Body>
                        <div className="space-y-default">
                            <FormField label="Evidence record" required>
                                <Combobox
                                    options={evidenceOptions}
                                    selected={evidenceOptions.find((o) => o.value === selectedEvidenceId) ?? null}
                                    setSelected={(opt) => setSelectedEvidenceId(opt?.value ?? '')}
                                    placeholder="Select evidence…"
                                />
                            </FormField>
                            <FormField label="Forensic category" hint="Which checklist category this evidence satisfies.">
                                <Combobox
                                    options={forensicCategoryOptions}
                                    selected={forensicCategoryOptions.find((o) => o.value === selectedForensicCategory) ?? null}
                                    setSelected={(opt) => setSelectedForensicCategory(opt?.value ?? '')}
                                    placeholder="Select category…"
                                />
                            </FormField>
                        </div>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" onClick={() => setEvidenceOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || !selectedEvidenceId}
                            onClick={async () => {
                                const ok = await post('/evidence', {
                                    evidenceId: selectedEvidenceId,
                                    forensicCategory: selectedForensicCategory || undefined,
                                });
                                if (ok) setEvidenceOpen(false);
                            }}
                        >
                            Link evidence
                        </Button>
                    </Modal.Actions>
                </Modal>
            )}
        </EntityDetailLayout>
    );
}
