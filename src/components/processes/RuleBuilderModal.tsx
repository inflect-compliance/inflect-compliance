'use client';

/**
 * Visual rule builder (Automation Epic 3).
 *
 * A three-step Modal that lets an admin configure an automation rule without
 * writing JSON — the primary gap vs Archer's GUI workflow designer.
 *
 *   Step 1 — Trigger:    name + event picker (grouped by domain)
 *   Step 2 — Conditions: field = value rows (equality at Epic 3; Epic 4 adds
 *                        operators + AND/OR groups)
 *   Step 3 — Action:     action type + typed sub-form per type
 *
 * Save POSTs (create) or PUTs (edit) to the rules API and revalidates the
 * list cache. Server-side Zod (automation.schemas.ts) is the authoritative
 * validation; the modal does light client-side gating to drive Next/Save.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSWRConfig } from 'swr';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserCombobox } from '@/components/ui/user-combobox';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import {
    EVENT_LABELS,
    eventOptionsByDomain,
    filterFieldsForEvent,
} from '@/lib/automation/event-labels';
import type { AutomationRuleRow } from '@/app/t/[tenantSlug]/(app)/processes/RulesTab';

type ActionType = 'NOTIFY_USER' | 'CREATE_TASK' | 'UPDATE_STATUS' | 'WEBHOOK';

type Operator = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt' | 'contains';

interface Condition {
    field: string;
    operator: Operator;
    value: string;
}

const OPERATOR_OPTIONS: ReadonlyArray<{ value: Operator; label: string }> = [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'in', label: 'any of' },
    { value: 'not_in', label: 'none of' },
    { value: 'gt', label: 'greater than' },
    { value: 'lt', label: 'less than' },
    { value: 'contains', label: 'contains' },
];

interface BuilderState {
    name: string;
    triggerEvent: string;
    logic: 'AND' | 'OR';
    conditions: Condition[];
    actionType: ActionType;
    notify: { userIds: string[]; message: string };
    task: { title: string; severity: string; priority: string };
    status: { entityType: string; field: string; toStatus: string };
    webhook: { url: string; method: string };
    /** Optional SLA window in minutes (Epic 5); empty = no SLA. */
    slaWindowMinutes: string;
    /** Optional chain target (Epic 7); empty = terminal rule. */
    nextRuleId: string;
    nextRuleDelay: string;
}

const EMPTY: BuilderState = {
    name: '',
    triggerEvent: '',
    logic: 'AND',
    conditions: [],
    actionType: 'NOTIFY_USER',
    notify: { userIds: [], message: '' },
    task: { title: '', severity: '', priority: '' },
    status: { entityType: 'Risk', field: 'status', toStatus: '' },
    webhook: { url: '', method: 'POST' },
    slaWindowMinutes: '',
    nextRuleId: '',
    nextRuleDelay: '',
};

const ACTION_OPTIONS: ReadonlyArray<{ value: ActionType; label: string; hint: string }> = [
    { value: 'NOTIFY_USER', label: 'Notify user', hint: 'Send an in-app notification' },
    { value: 'CREATE_TASK', label: 'Create task', hint: 'Open a remediation task' },
    { value: 'UPDATE_STATUS', label: 'Update status', hint: 'Move an entity to a status' },
    { value: 'WEBHOOK', label: 'Webhook', hint: 'POST to an external URL' },
];

const triggerOptions: ComboboxOption[] = eventOptionsByDomain().flatMap((g) =>
    g.events.map((ev) => ({ value: ev.name, label: ev.label })),
);

export interface RuleBuilderModalProps {
    tenantSlug: string;
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    /** When set, the modal edits this rule (PUT); otherwise it creates (POST). */
    editRule?: AutomationRuleRow | null;
}

export function RuleBuilderModal({ tenantSlug, open, setOpen, editRule }: RuleBuilderModalProps) {
    const apiUrl = useTenantApiUrl();
    const { mutate } = useSWRConfig();
    // Epic 7 — chain targets (other rules). Excludes the rule being edited.
    const { data: allRules } = useTenantSWR<AutomationRuleRow[]>(
        CACHE_KEYS.automation.rules.list(),
    );
    const chainOptions: ComboboxOption[] = (allRules ?? [])
        .filter((r) => r.id !== editRule?.id)
        .map((r) => ({ value: r.id, label: r.name }));
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [form, setForm] = useState<BuilderState>(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const patch = (p: Partial<BuilderState>) => setForm((f) => ({ ...f, ...p }));

    const availableFields = useMemo(
        () => filterFieldsForEvent(form.triggerEvent),
        [form.triggerEvent],
    );

    const step1Valid = form.name.trim().length > 0 && form.triggerEvent.length > 0;
    const step3Valid = (() => {
        switch (form.actionType) {
            case 'NOTIFY_USER':
                return form.notify.userIds.length > 0 && form.notify.message.trim().length > 0;
            case 'CREATE_TASK':
                return form.task.title.trim().length > 0;
            case 'UPDATE_STATUS':
                return form.status.toStatus.trim().length > 0;
            case 'WEBHOOK':
                return /^https?:\/\//.test(form.webhook.url.trim());
        }
    })();

    function buildActionConfig(): Record<string, unknown> {
        switch (form.actionType) {
            case 'NOTIFY_USER':
                return { userIds: form.notify.userIds, message: form.notify.message.trim() };
            case 'CREATE_TASK':
                return {
                    title: form.task.title.trim(),
                    ...(form.task.severity ? { severity: form.task.severity } : {}),
                    ...(form.task.priority ? { priority: form.task.priority } : {}),
                };
            case 'UPDATE_STATUS':
                return {
                    entityType: form.status.entityType,
                    field: form.status.field,
                    toStatus: form.status.toStatus.trim(),
                };
            case 'WEBHOOK':
                return { url: form.webhook.url.trim(), method: form.webhook.method };
        }
    }

    function buildTriggerFilter():
        | {
              logic: 'AND' | 'OR';
              conditions: Array<{ field: string; operator: Operator; value: string | string[] }>;
          }
        | null {
        const valid = form.conditions.filter((c) => c.field && c.value !== '');
        if (valid.length === 0) return null;
        return {
            logic: form.logic,
            conditions: valid.map((c) => ({
                field: c.field,
                operator: c.operator,
                // in/not_in take a value set — split the comma-separated input.
                value:
                    c.operator === 'in' || c.operator === 'not_in'
                        ? c.value.split(',').map((s) => s.trim()).filter(Boolean)
                        : c.value,
            })),
        };
    }

    async function handleSave() {
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                name: form.name.trim(),
                triggerEvent: form.triggerEvent,
                triggerFilter: buildTriggerFilter(),
                actionType: form.actionType,
                actionConfig: buildActionConfig(),
                slaWindowMinutes: form.slaWindowMinutes
                    ? Number(form.slaWindowMinutes)
                    : null,
                nextRuleId: form.nextRuleId || null,
                nextRuleDelay: form.nextRuleDelay ? Number(form.nextRuleDelay) : null,
            };
            const url = editRule
                ? apiUrl(CACHE_KEYS.automation.rules.detail(editRule.id))
                : apiUrl(CACHE_KEYS.automation.rules.list());
            const res = await fetch(url, {
                method: editRule ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({ error: 'Save failed' }));
                throw new Error(e.error ?? 'Save failed');
            }
            await mutate(apiUrl(CACHE_KEYS.automation.rules.list()));
            setOpen(false);
            setForm(EMPTY);
            setStep(1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSubmitting(false);
        }
    }

    const triggerSelected = form.triggerEvent
        ? triggerOptions.find((o) => o.value === form.triggerEvent) ?? null
        : null;

    return (
        <Modal showModal={open} setShowModal={setOpen} title={editRule ? 'Edit rule' : 'New rule'} size="lg">
            <Modal.Header title={editRule ? 'Edit automation rule' : 'New automation rule'} />
            <Modal.Body>
                <p className="mb-default text-xs uppercase tracking-wide text-content-subtle">
                    Step {step} of 3 —{' '}
                    {step === 1 ? 'Trigger' : step === 2 ? 'Conditions' : 'Action'}
                </p>

                {step === 1 && (
                    <div className="space-y-default">
                        <FormField label="Rule name" required>
                            <Input
                                value={form.name}
                                onChange={(e) => patch({ name: e.target.value })}
                                placeholder="Notify owner on critical risk"
                            />
                        </FormField>
                        <FormField label="Trigger event" required>
                            <Combobox
                                options={triggerOptions}
                                selected={triggerSelected}
                                setSelected={(o) => patch({ triggerEvent: o?.value ?? '', conditions: [] })}
                                placeholder="Select an event…"
                                forceDropdown
                                matchTriggerWidth
                                optionDescription={(o) =>
                                    EVENT_LABELS[o.value as keyof typeof EVENT_LABELS]?.description ?? ''
                                }
                            />
                        </FormField>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-default">
                        {availableFields.length === 0 ? (
                            <p className="text-sm text-content-muted">
                                This event has no filterable fields — the rule fires on every
                                occurrence.
                            </p>
                        ) : (
                            <>
                                {/* AND/OR group logic — shown once ≥2 conditions exist. */}
                                {form.conditions.length > 1 && (
                                    <div className="flex items-center gap-compact text-sm">
                                        <span className="text-content-muted">Match</span>
                                        <RadioGroup
                                            value={form.logic}
                                            onValueChange={(v) => patch({ logic: v as 'AND' | 'OR' })}
                                            className="flex gap-default"
                                        >
                                            <label className="flex items-center gap-tight">
                                                <RadioGroupItem value="AND" /> all (AND)
                                            </label>
                                            <label className="flex items-center gap-tight">
                                                <RadioGroupItem value="OR" /> any (OR)
                                            </label>
                                        </RadioGroup>
                                    </div>
                                )}
                                {form.conditions.map((cond, i) => {
                                    const fieldDef = availableFields.find((f) => f.field === cond.field);
                                    const isSet = cond.operator === 'in' || cond.operator === 'not_in';
                                    return (
                                        <div key={i} className="flex items-end gap-compact">
                                            <FormField label={i === 0 ? 'Field' : undefined} className="flex-1">
                                                <Combobox
                                                    options={availableFields.map((f) => ({
                                                        value: f.field,
                                                        label: f.label,
                                                    }))}
                                                    selected={
                                                        cond.field
                                                            ? { value: cond.field, label: fieldDef?.label ?? cond.field }
                                                            : null
                                                    }
                                                    setSelected={(o) => {
                                                        const next = [...form.conditions];
                                                        next[i] = { ...next[i], field: o?.value ?? '', value: '' };
                                                        patch({ conditions: next });
                                                    }}
                                                    placeholder="Field…"
                                                    forceDropdown
                                                    matchTriggerWidth
                                                />
                                            </FormField>
                                            <FormField label={i === 0 ? 'Operator' : undefined}>
                                                <Combobox
                                                    options={OPERATOR_OPTIONS.map((op) => ({
                                                        value: op.value,
                                                        label: op.label,
                                                    }))}
                                                    selected={{
                                                        value: cond.operator,
                                                        label:
                                                            OPERATOR_OPTIONS.find((op) => op.value === cond.operator)
                                                                ?.label ?? cond.operator,
                                                    }}
                                                    setSelected={(o) => {
                                                        const next = [...form.conditions];
                                                        next[i] = {
                                                            ...next[i],
                                                            operator: (o?.value as Operator) ?? 'eq',
                                                        };
                                                        patch({ conditions: next });
                                                    }}
                                                    forceDropdown
                                                    matchTriggerWidth
                                                />
                                            </FormField>
                                            <FormField label={i === 0 ? 'Value' : undefined} className="flex-1">
                                                {fieldDef?.type === 'enum' && !isSet ? (
                                                    <Combobox
                                                        options={(fieldDef.options ?? []).map((opt) => ({
                                                            value: opt.value,
                                                            label: opt.label,
                                                        }))}
                                                        selected={
                                                            cond.value
                                                                ? { value: cond.value, label: cond.value }
                                                                : null
                                                        }
                                                        setSelected={(o) => {
                                                            const next = [...form.conditions];
                                                            next[i] = { ...next[i], value: o?.value ?? '' };
                                                            patch({ conditions: next });
                                                        }}
                                                        placeholder="Value…"
                                                        forceDropdown
                                                        matchTriggerWidth
                                                    />
                                                ) : (
                                                    <Input
                                                        type={
                                                            fieldDef?.type === 'number' && !isSet
                                                                ? 'number'
                                                                : 'text'
                                                        }
                                                        value={cond.value}
                                                        onChange={(e) => {
                                                            const next = [...form.conditions];
                                                            next[i] = { ...next[i], value: e.target.value };
                                                            patch({ conditions: next });
                                                        }}
                                                        placeholder={isSet ? 'comma,separated,values' : 'Value'}
                                                    />
                                                )}
                                            </FormField>
                                            <Button
                                                variant="ghost"
                                                onClick={() =>
                                                    patch({
                                                        conditions: form.conditions.filter((_, j) => j !== i),
                                                    })
                                                }
                                                aria-label="Remove condition"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    );
                                })}
                                <Button
                                    variant="secondary"
                                    onClick={() =>
                                        patch({
                                            conditions: [
                                                ...form.conditions,
                                                {
                                                    field: availableFields[0]?.field ?? '',
                                                    operator: 'eq',
                                                    value: '',
                                                },
                                            ],
                                        })
                                    }
                                >
                                    Add condition
                                </Button>
                                <p className="text-xs text-content-subtle">
                                    Set operators (any of / none of) take a comma-separated value
                                    set. Numeric fields support greater/less than.
                                </p>
                            </>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-default">
                        <RadioGroup
                            value={form.actionType}
                            onValueChange={(v) => patch({ actionType: v as ActionType })}
                            className="space-y-tight"
                        >
                            {ACTION_OPTIONS.map((a) => (
                                <label key={a.value} className="flex items-center gap-compact text-sm">
                                    <RadioGroupItem value={a.value} />
                                    <span className="text-content-emphasis">{a.label}</span>
                                    <span className="text-content-subtle">— {a.hint}</span>
                                </label>
                            ))}
                        </RadioGroup>

                        <div className="border-t border-border-subtle pt-default space-y-default">
                            {form.actionType === 'NOTIFY_USER' && (
                                <>
                                    <FormField label="Recipients" required>
                                        <UserCombobox
                                            tenantSlug={tenantSlug}
                                            multiple
                                            selectedIds={form.notify.userIds}
                                            onChange={(ids) =>
                                                patch({ notify: { ...form.notify, userIds: ids } })
                                            }
                                            forceDropdown
                                            matchTriggerWidth
                                        />
                                    </FormField>
                                    <FormField label="Message" required>
                                        <Textarea
                                            value={form.notify.message}
                                            onChange={(e) =>
                                                patch({ notify: { ...form.notify, message: e.target.value } })
                                            }
                                            placeholder="Risk {{title}} was escalated."
                                        />
                                    </FormField>
                                </>
                            )}
                            {form.actionType === 'CREATE_TASK' && (
                                <FormField label="Task title" required>
                                    <Input
                                        value={form.task.title}
                                        onChange={(e) =>
                                            patch({ task: { ...form.task, title: e.target.value } })
                                        }
                                        placeholder="Remediate {{title}}"
                                    />
                                </FormField>
                            )}
                            {form.actionType === 'UPDATE_STATUS' && (
                                <FormField label="New status" required>
                                    <Input
                                        value={form.status.toStatus}
                                        onChange={(e) =>
                                            patch({ status: { ...form.status, toStatus: e.target.value } })
                                        }
                                        placeholder="IN_REVIEW"
                                    />
                                </FormField>
                            )}
                            {form.actionType === 'WEBHOOK' && (
                                <FormField label="Webhook URL" required>
                                    <Input
                                        value={form.webhook.url}
                                        onChange={(e) =>
                                            patch({ webhook: { ...form.webhook, url: e.target.value } })
                                        }
                                        placeholder="https://hooks.example.com/…"
                                    />
                                </FormField>
                            )}
                        </div>

                        {/* SLA window (Epic 5) — optional deadline for resolution. */}
                        <div className="border-t border-border-subtle pt-default">
                            <FormField
                                label="SLA window (minutes)"
                                description="Optional. If an execution runs past this many minutes it's flagged as breached."
                            >
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.slaWindowMinutes}
                                    onChange={(e) => patch({ slaWindowMinutes: e.target.value })}
                                    placeholder="e.g. 1440 (24h)"
                                />
                            </FormField>
                        </div>

                        {/* Chain to next rule (Epic 7) — sequential workflow. */}
                        <div className="border-t border-border-subtle pt-default space-y-default">
                            <FormField
                                label="Chain to next rule"
                                description="Optional. After this rule succeeds, fire another rule."
                            >
                                <Combobox
                                    options={chainOptions}
                                    selected={
                                        form.nextRuleId
                                            ? chainOptions.find((o) => o.value === form.nextRuleId) ?? null
                                            : null
                                    }
                                    setSelected={(o) => patch({ nextRuleId: o?.value ?? '' })}
                                    placeholder="No chained rule"
                                    forceDropdown
                                    matchTriggerWidth
                                />
                            </FormField>
                            {form.nextRuleId && (
                                <FormField label="Chain delay (minutes)">
                                    <Input
                                        type="number"
                                        min={0}
                                        value={form.nextRuleDelay}
                                        onChange={(e) => patch({ nextRuleDelay: e.target.value })}
                                        placeholder="0 (immediate)"
                                    />
                                </FormField>
                            )}
                        </div>
                    </div>
                )}

                {error && <p className="mt-default text-sm text-content-error">{error}</p>}
            </Modal.Body>
            <Modal.Actions align="between">
                <Button
                    variant="ghost"
                    onClick={() => (step === 1 ? setOpen(false) : setStep((s) => (s - 1) as 1 | 2))}
                >
                    {step === 1 ? 'Cancel' : 'Back'}
                </Button>
                {step < 3 ? (
                    <Button
                        variant="primary"
                        disabled={step === 1 && !step1Valid}
                        onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                    >
                        Next
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        loading={submitting}
                        disabled={!step3Valid || submitting}
                        onClick={handleSave}
                    >
                        {editRule ? 'Save rule' : 'Create rule'}
                    </Button>
                )}
            </Modal.Actions>
        </Modal>
    );
}
