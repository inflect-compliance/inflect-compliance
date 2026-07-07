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
import { useTranslations } from 'next-intl';
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

/** Surface-namespace resolver (`useTranslations('automation.ruleBuilder')`). */
type RuleTranslate = ReturnType<typeof useTranslations>;

function buildOperatorOptions(
    t: RuleTranslate,
): ReadonlyArray<{ value: Operator; label: string }> {
    return [
        { value: 'eq', label: t('opEquals') },
        { value: 'neq', label: t('opNotEquals') },
        { value: 'in', label: t('opAnyOf') },
        { value: 'not_in', label: t('opNoneOf') },
        { value: 'gt', label: t('opGreaterThan') },
        { value: 'lt', label: t('opLessThan') },
        { value: 'contains', label: t('opContains') },
    ];
}

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

function buildActionOptions(
    t: RuleTranslate,
): ReadonlyArray<{ value: ActionType; label: string; hint: string }> {
    return [
        { value: 'NOTIFY_USER', label: t('actionNotify'), hint: t('actionNotifyHint') },
        { value: 'CREATE_TASK', label: t('actionCreateTask'), hint: t('actionCreateTaskHint') },
        { value: 'UPDATE_STATUS', label: t('actionUpdateStatus'), hint: t('actionUpdateStatusHint') },
        { value: 'WEBHOOK', label: t('actionWebhook'), hint: t('actionWebhookHint') },
    ];
}

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
    const t = useTranslations('automation.ruleBuilder');
    const operatorOptions = useMemo(() => buildOperatorOptions(t), [t]);
    const actionOptions = useMemo(() => buildActionOptions(t), [t]);
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
                const e = await res.json().catch(() => ({ error: t('saveFailed') }));
                throw new Error(e.error ?? t('saveFailed'));
            }
            await mutate(apiUrl(CACHE_KEYS.automation.rules.list()));
            setOpen(false);
            setForm(EMPTY);
            setStep(1);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('saveFailed'));
        } finally {
            setSubmitting(false);
        }
    }

    const triggerSelected = form.triggerEvent
        ? triggerOptions.find((o) => o.value === form.triggerEvent) ?? null
        : null;

    return (
        <Modal showModal={open} setShowModal={setOpen} title={editRule ? t('editTitle') : t('newTitle')} size="lg">
            <Modal.Header title={editRule ? t('editHeader') : t('newHeader')} />
            <Modal.Body>
                <p className="mb-default text-xs uppercase tracking-wide text-content-subtle">
                    {t('stepIndicator', {
                        step,
                        phase:
                            step === 1
                                ? t('phaseTrigger')
                                : step === 2
                                  ? t('phaseConditions')
                                  : t('phaseAction'),
                    })}
                </p>

                {step === 1 && (
                    <div className="space-y-default">
                        <FormField label={t('ruleName')} required>
                            <Input
                                value={form.name}
                                onChange={(e) => patch({ name: e.target.value })}
                                placeholder={t('ruleNamePlaceholder')}
                            />
                        </FormField>
                        <FormField label={t('triggerEvent')} required>
                            <Combobox
                                options={triggerOptions}
                                selected={triggerSelected}
                                setSelected={(o) => patch({ triggerEvent: o?.value ?? '', conditions: [] })}
                                placeholder={t('selectEvent')}
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
                                {t('filterableFieldsHint')}
                            </p>
                        ) : (
                            <>
                                {/* AND/OR group logic — shown once ≥2 conditions exist. */}
                                {form.conditions.length > 1 && (
                                    <div className="flex items-center gap-compact text-sm">
                                        <span className="text-content-muted">{t('match')}</span>
                                        <RadioGroup
                                            value={form.logic}
                                            onValueChange={(v) => patch({ logic: v as 'AND' | 'OR' })}
                                            className="flex gap-default"
                                        >
                                            <label className="flex items-center gap-tight">
                                                <RadioGroupItem value="AND" /> {t('allAnd')}
                                            </label>
                                            <label className="flex items-center gap-tight">
                                                <RadioGroupItem value="OR" /> {t('anyOr')}
                                            </label>
                                        </RadioGroup>
                                    </div>
                                )}
                                {form.conditions.map((cond, i) => {
                                    const fieldDef = availableFields.find((f) => f.field === cond.field);
                                    const isSet = cond.operator === 'in' || cond.operator === 'not_in';
                                    return (
                                        <div key={i} className="flex items-end gap-compact">
                                            <FormField label={i === 0 ? t('field') : undefined} className="flex-1">
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
                                                    placeholder={t('fieldPlaceholder')}
                                                    forceDropdown
                                                    matchTriggerWidth
                                                />
                                            </FormField>
                                            <FormField label={i === 0 ? t('operator') : undefined}>
                                                <Combobox
                                                    options={operatorOptions.map((op) => ({
                                                        value: op.value,
                                                        label: op.label,
                                                    }))}
                                                    selected={{
                                                        value: cond.operator,
                                                        label:
                                                            operatorOptions.find((op) => op.value === cond.operator)
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
                                            <FormField label={i === 0 ? t('value') : undefined} className="flex-1">
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
                                                        placeholder={t('valuePlaceholder')}
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
                                                        placeholder={isSet ? t('commaSeparated') : t('valuePlain')}
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
                                                aria-label={t('removeCondition')}
                                            >
                                                {t('remove')}
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
                                    {t('addCondition')}
                                </Button>
                                <p className="text-xs text-content-subtle">
                                    {t('conditionsHint')}
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
                            {actionOptions.map((a) => (
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
                                    <FormField label={t('recipients')} required>
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
                                    <FormField label={t('message')} required>
                                        <Textarea
                                            value={form.notify.message}
                                            onChange={(e) =>
                                                patch({ notify: { ...form.notify, message: e.target.value } })
                                            }
                                            placeholder={t('messagePlaceholder')}
                                        />
                                    </FormField>
                                </>
                            )}
                            {form.actionType === 'CREATE_TASK' && (
                                <FormField label={t('taskTitle')} required>
                                    <Input
                                        value={form.task.title}
                                        onChange={(e) =>
                                            patch({ task: { ...form.task, title: e.target.value } })
                                        }
                                        placeholder={t('taskTitlePlaceholder')}
                                    />
                                </FormField>
                            )}
                            {form.actionType === 'UPDATE_STATUS' && (
                                <FormField label={t('newStatus')} required>
                                    <Input
                                        value={form.status.toStatus}
                                        onChange={(e) =>
                                            patch({ status: { ...form.status, toStatus: e.target.value } })
                                        }
                                        placeholder={t('newStatusPlaceholder')}
                                    />
                                </FormField>
                            )}
                            {form.actionType === 'WEBHOOK' && (
                                <FormField label={t('webhookUrl')} required>
                                    <Input
                                        value={form.webhook.url}
                                        onChange={(e) =>
                                            patch({ webhook: { ...form.webhook, url: e.target.value } })
                                        }
                                        placeholder={t('webhookUrlPlaceholder')}
                                    />
                                </FormField>
                            )}
                        </div>

                        {/* SLA window (Epic 5) — optional deadline for resolution. */}
                        <div className="border-t border-border-subtle pt-default">
                            <FormField
                                label={t('slaLabel')}
                                description={t('slaDescription')}
                            >
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.slaWindowMinutes}
                                    onChange={(e) => patch({ slaWindowMinutes: e.target.value })}
                                    placeholder={t('slaPlaceholder')}
                                />
                            </FormField>
                        </div>

                        {/* Chain to next rule (Epic 7) — sequential workflow. */}
                        <div className="border-t border-border-subtle pt-default space-y-default">
                            <FormField
                                label={t('chainLabel')}
                                description={t('chainDescription')}
                            >
                                <Combobox
                                    options={chainOptions}
                                    selected={
                                        form.nextRuleId
                                            ? chainOptions.find((o) => o.value === form.nextRuleId) ?? null
                                            : null
                                    }
                                    setSelected={(o) => patch({ nextRuleId: o?.value ?? '' })}
                                    placeholder={t('noChainedRule')}
                                    forceDropdown
                                    matchTriggerWidth
                                />
                            </FormField>
                            {form.nextRuleId && (
                                <FormField label={t('chainDelayLabel')}>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={form.nextRuleDelay}
                                        onChange={(e) => patch({ nextRuleDelay: e.target.value })}
                                        placeholder={t('chainDelayPlaceholder')}
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
                    {step === 1 ? t('cancel') : t('back')}
                </Button>
                {step < 3 ? (
                    <Button
                        variant="primary"
                        disabled={step === 1 && !step1Valid}
                        onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                    >
                        {t('next')}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        loading={submitting}
                        disabled={!step3Valid || submitting}
                        onClick={handleSave}
                    >
                        {editRule ? t('saveRule') : t('createRule')}
                    </Button>
                )}
            </Modal.Actions>
        </Modal>
    );
}
