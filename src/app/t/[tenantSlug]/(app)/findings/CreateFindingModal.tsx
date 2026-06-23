'use client';

/**
 * Create-finding modal.
 *
 * Replaces the inline create form on the findings list with a modal that
 * captures the full finding shape: title/description/type/severity/due
 * date PLUS an assignee (tenant member), a linked control, a compensating
 * control, multiple implicated risks, and a free-text analysis.
 *
 * Business contract — POST /api/t/:slug/findings with
 *   { title, description, severity, type, dueDate?, analysis?,
 *     assigneeUserId?, controlId?, compensatingControlId?, riskIds[] }
 * The server validates every referenced id against the tenant. On success
 * the findings list cache is invalidated.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useSWRConfig } from 'swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import type { CappedList } from '@/lib/list-backfill-cap';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserCombobox } from '@/components/ui/user-combobox';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import { useFormTelemetry } from '@/lib/telemetry/form-telemetry';

interface ControlOption {
    id: string;
    annexId: string | null;
    name: string;
}

interface RiskOption {
    id: string;
    key: string | null;
    title: string;
}

const SEVERITY_OPTIONS: ComboboxOption[] = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];

const TYPE_OPTIONS: ComboboxOption[] = [
    { value: 'NONCONFORMITY', label: 'Nonconformity' },
    { value: 'OBSERVATION', label: 'Observation' },
    { value: 'OPPORTUNITY', label: 'Opportunity' },
];

const EMPTY_FORM = {
    title: '',
    description: '',
    severity: 'MEDIUM',
    type: 'OBSERVATION',
    assigneeUserId: '',
    controlId: '',
    compensatingControlId: '',
    analysis: '',
    dueDate: '',
};

export interface CreateFindingModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    tenantSlug: string;
    apiUrl: (path: string) => string;
}

export function CreateFindingModal({
    open,
    setOpen,
    tenantSlug,
    apiUrl,
}: CreateFindingModalProps) {
    const close = useCallback(() => setOpen(false), [setOpen]);
    const { mutate: swrMutate } = useSWRConfig();
    const titleRef = useRef<HTMLInputElement>(null);
    const telemetry = useFormTelemetry('CreateFindingModal');

    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [selectedRiskIds, setSelectedRiskIds] = useState<Set<string>>(new Set());
    const [riskFilter, setRiskFilter] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    // ── Lookups load while the modal is open ──
    // Null-key idiom gates the fetch on `open` (replaces `enabled: open`).
    const controlsQuery = useTenantSWR<CappedList<ControlOption> | ControlOption[]>(
        open ? CACHE_KEYS.controls.list() : null,
    );
    const controls = useMemo<ControlOption[]>(() => {
        const data = controlsQuery.data;
        // GET /controls returns the backfill-capped `{ rows, truncated }`
        // shape, not a bare array — unwrap both forms (mirrors the risks
        // dropdown below). The prior bare-array-only guard silently rendered
        // an EMPTY control picker, so a finding could never be linked to a
        // control at create time.
        const rows = Array.isArray(data) ? data : (data?.rows ?? []);
        return rows.map((c) => ({
            id: c.id,
            annexId: c.annexId ?? null,
            name: c.name,
        }));
    }, [controlsQuery.data]);

    const risksQuery = useTenantSWR<CappedList<RiskOption> | RiskOption[]>(
        open ? CACHE_KEYS.risks.list() : null,
    );
    const risks = useMemo<RiskOption[]>(() => {
        const data = risksQuery.data;
        const rows = Array.isArray(data) ? data : (data?.rows ?? []);
        return rows.map((r) => ({ id: r.id, key: r.key ?? null, title: r.title }));
    }, [risksQuery.data]);

    const controlOptions = useMemo<ComboboxOption[]>(
        () =>
            controls.map((c) => ({
                value: c.id,
                label: c.annexId ? `${c.annexId} · ${c.name}` : c.name,
            })),
        [controls],
    );

    const filteredRisks = useMemo(() => {
        const q = riskFilter.trim().toLowerCase();
        if (!q) return risks;
        return risks.filter(
            (r) =>
                r.title.toLowerCase().includes(q) ||
                (r.key ?? '').toLowerCase().includes(q),
        );
    }, [risks, riskFilter]);

    const toggleRisk = (id: string) =>
        setSelectedRiskIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // ── Reset + focus on open ──
    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({ ...EMPTY_FORM });
        setSelectedRiskIds(new Set());
        setRiskFilter('');
        setError('');
        setSubmitting(false);
        const t = setTimeout(() => titleRef.current?.focus(), 60);
        return () => clearTimeout(t);
    }, [open]);

    const canSubmit =
        form.title.trim().length > 0 &&
        form.description.trim().length > 0 &&
        !submitting;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        telemetry.trackSubmit({
            severity: form.severity,
            type: form.type,
            hasAssignee: Boolean(form.assigneeUserId),
            hasControl: Boolean(form.controlId),
            hasCompensatingControl: Boolean(form.compensatingControlId),
            riskLinkCount: selectedRiskIds.size,
        });
        try {
            const payload: Record<string, unknown> = {
                title: form.title.trim(),
                description: form.description.trim(),
                severity: form.severity,
                type: form.type,
                assigneeUserId: form.assigneeUserId || undefined,
                controlId: form.controlId || undefined,
                compensatingControlId: form.compensatingControlId || undefined,
                analysis: form.analysis.trim() || undefined,
                riskIds: Array.from(selectedRiskIds),
            };
            if (form.dueDate) payload.dueDate = form.dueDate;

            const res = await fetch(apiUrl('/findings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    data.message || data.error || `Failed to create finding (${res.status})`,
                );
            }
            const finding = await res.json();
            swrMutate(`/api/t/${tenantSlug}${CACHE_KEYS.findings.list()}`);
            telemetry.trackSuccess({ findingId: finding.id });
            close();
        } catch (err) {
            telemetry.trackError(err);
            setError(err instanceof Error ? err.message : 'Failed to create finding');
            setSubmitting(false);
        }
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title="New finding"
            description="Record an audit finding."
            preventDefaultClose={submitting}
        >
            <Modal.Header
                title="New finding"
                description="Capture a nonconformity, observation, or opportunity — with its owner, controls, and implicated risks."
            />
            <Modal.Form id="create-finding-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="create-finding-error"
                            role="alert"
                            data-testid="create-finding-error"
                        >
                            {error}
                        </div>
                    )}

                    <fieldset disabled={submitting} className="m-0 border-0 p-0">
                        <FormSection eyebrow="Finding details">
                            <FormField label="Title" required>
                                <Input
                                    id="finding-title"
                                    ref={titleRef}
                                    type="text"
                                    placeholder="e.g. Access reviews not performed quarterly"
                                    value={form.title}
                                    onChange={(e) => update('title', e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                            </FormField>

                            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                                <FormField label="Type">
                                    <Combobox
                                        id="finding-type"
                                        name="type"
                                        options={TYPE_OPTIONS}
                                        selected={TYPE_OPTIONS.find((o) => o.value === form.type) ?? null}
                                        setSelected={(o) => update('type', o?.value ?? 'OBSERVATION')}
                                        hideSearch
                                        matchTriggerWidth
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                </FormField>
                                <FormField label="Severity">
                                    <Combobox
                                        id="finding-severity"
                                        name="severity"
                                        options={SEVERITY_OPTIONS}
                                        selected={SEVERITY_OPTIONS.find((o) => o.value === form.severity) ?? null}
                                        setSelected={(o) => update('severity', o?.value ?? 'MEDIUM')}
                                        hideSearch
                                        matchTriggerWidth
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                </FormField>
                            </div>

                            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                                <FormField label="Assignee">
                                    <UserCombobox
                                        tenantSlug={tenantSlug}
                                        selectedId={form.assigneeUserId || null}
                                        onChange={(userId) => update('assigneeUserId', userId ?? '')}
                                        matchTriggerWidth
                                        id="finding-assignee"
                                        placeholder="Unassigned"
                                    />
                                </FormField>
                                <FormField label="Due date">
                                    <DatePicker
                                        id="finding-due-date"
                                        className="w-full"
                                        placeholder="Select date"
                                        clearable
                                        align="start"
                                        value={parseYMD(form.dueDate)}
                                        onChange={(next) => update('dueDate', toYMD(next) ?? '')}
                                        disabledDays={{ before: startOfUtcDay(new Date()) }}
                                        aria-label="Due date"
                                    />
                                </FormField>
                            </div>

                            <FormField label="Description" required>
                                <Textarea
                                    id="finding-description"
                                    rows={3}
                                    placeholder="What was observed?"
                                    value={form.description}
                                    onChange={(e) => update('description', e.target.value)}
                                    required
                                />
                            </FormField>
                        </FormSection>

                        <FormSection eyebrow="Controls & risks">
                            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                                <FormField
                                    label="Linked control"
                                    description="The control this finding is raised against."
                                >
                                    <Combobox
                                        id="finding-control"
                                        name="controlId"
                                        options={controlOptions}
                                        selected={controlOptions.find((o) => o.value === form.controlId) ?? null}
                                        setSelected={(o) => update('controlId', o?.value ?? '')}
                                        loading={controlsQuery.isLoading}
                                        placeholder="— None"
                                        searchPlaceholder="Search controls…"
                                        emptyState="No controls match"
                                        matchTriggerWidth
                                        forceDropdown
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                </FormField>
                                <FormField
                                    label="Compensating control"
                                    description="A control that mitigates the finding."
                                >
                                    <Combobox
                                        id="finding-compensating-control"
                                        name="compensatingControlId"
                                        options={controlOptions}
                                        selected={
                                            controlOptions.find((o) => o.value === form.compensatingControlId) ?? null
                                        }
                                        setSelected={(o) => update('compensatingControlId', o?.value ?? '')}
                                        loading={controlsQuery.isLoading}
                                        placeholder="— None"
                                        searchPlaceholder="Search controls…"
                                        emptyState="No controls match"
                                        matchTriggerWidth
                                        forceDropdown
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                </FormField>
                            </div>

                            <FormField label={`Implicated risks (${selectedRiskIds.size} selected)`}>
                                <div className="rounded-lg border border-border-subtle bg-bg-subtle">
                                    <div className="border-b border-border-subtle p-2">
                                        <Input
                                            id="finding-risk-filter"
                                            type="text"
                                            placeholder="Search risks…"
                                            value={riskFilter}
                                            onChange={(e) => setRiskFilter(e.target.value)}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div
                                        className="max-h-40 space-y-1 overflow-y-auto p-2"
                                        data-testid="finding-risks-list"
                                    >
                                        {risksQuery.isLoading ? (
                                            <p className="px-1 py-1 text-sm text-content-muted">Loading risks…</p>
                                        ) : filteredRisks.length === 0 ? (
                                            <p className="px-1 py-1 text-sm text-content-muted">
                                                No risks to link.
                                            </p>
                                        ) : (
                                            filteredRisks.map((r) => (
                                                <label
                                                    key={r.id}
                                                    className="flex cursor-pointer items-center gap-tight rounded px-1 py-1 text-sm text-content-default hover:bg-bg-muted"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedRiskIds.has(r.id)}
                                                        onChange={() => toggleRisk(r.id)}
                                                        className="accent-brand-emphasis"
                                                        data-testid={`finding-risk-opt-${r.id}`}
                                                    />
                                                    <span className="w-16 shrink-0 text-xs text-content-muted">
                                                        {r.key || 'RISK'}
                                                    </span>
                                                    <span className="truncate text-content-emphasis">{r.title}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </FormField>
                        </FormSection>

                        <FormSection eyebrow="Analysis">
                            <FormField
                                label="Analysis / comments"
                                description="Free-text notes — encrypted at rest."
                            >
                                <Textarea
                                    id="finding-analysis"
                                    rows={3}
                                    placeholder="Investigation notes, context, remediation thoughts…"
                                    value={form.analysis}
                                    onChange={(e) => update('analysis', e.target.value)}
                                />
                            </FormField>
                        </FormSection>
                    </fieldset>
                </Modal.Body>

                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        id="create-finding-cancel-btn"
                        onClick={() => {
                            if (!submitting) close();
                        }}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        id="submit-finding"
                        disabled={!canSubmit}
                    >
                        {submitting ? 'Creating…' : 'Create finding'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
