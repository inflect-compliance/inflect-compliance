'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BIA_CRITICALITY_LABELS } from './filter-defs';

const CRITICALITY_OPTIONS = Object.entries(BIA_CRITICALITY_LABELS).map(([value, label]) => ({ value, label }));

const optionalHours = z.number().int().min(0).max(100_000).optional();

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    rtoHours: optionalHours,
    rpoHours: optionalHours,
    mtpdHours: optionalHours,
    notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

// Empty number input → undefined (not NaN) so the optional schema passes.
const numberSetValueAs = (v: unknown) => (v === '' || v == null ? undefined : Number(v));

interface Props {
    tenantSlug: string;
    /** Prefill the analysed process node (from the canvas "Add BIA" cross-link). */
    processNodeId?: string;
    onClose: () => void;
    onCreated: (id: string) => void | Promise<void>;
}

export function NewBiaModal({ tenantSlug, processNodeId, onClose, onCreated }: Props) {
    const [apiError, setApiError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', criticality: 'HIGH', notes: '' },
        mode: 'onTouched',
    });

    const onSubmit = async (values: FormValues) => {
        setApiError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/business-continuity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: values.name,
                    criticality: values.criticality,
                    rtoHours: values.rtoHours,
                    rpoHours: values.rpoHours,
                    mtpdHours: values.mtpdHours,
                    notes: values.notes || undefined,
                    processNodeId: processNodeId || undefined,
                }),
            });
            if (!res.ok) throw new Error('Failed to create BIA');
            const created = (await res.json()) as { id: string };
            await onCreated(created.id);
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Failed to create BIA');
        }
    };

    return (
        <Modal
            showModal
            setShowModal={(v) => {
                if (!v && !isSubmitting) onClose();
            }}
            size="lg"
            title="Create BIA"
            description="Analyse a process's recovery objectives for business continuity."
            preventDefaultClose={isSubmitting}
        >
            <Modal.Header title="Create BIA" description="Analyse a process's recovery objectives (ISO 22301 / NIS2 Art.21(2)(c))." />
            <Modal.Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body>
                    {apiError && (
                        <div className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                            {apiError}
                        </div>
                    )}
                    <div className="space-y-default">
                        <FormField label="Process / service" required error={errors.name?.message}>
                            <Input id="bia-name-input" type="text" placeholder="e.g. Payment Processing" autoComplete="off" {...register('name')} />
                        </FormField>
                        <FormField label="Criticality" required error={errors.criticality?.message}>
                            <Controller
                                control={control}
                                name="criticality"
                                render={({ field }) => (
                                    <Combobox
                                        id="bia-criticality-input"
                                        name="criticality"
                                        options={CRITICALITY_OPTIONS}
                                        selected={CRITICALITY_OPTIONS.find((o) => o.value === field.value) ?? null}
                                        setSelected={(o) => field.onChange(o?.value ?? 'HIGH')}
                                        placeholder="Select criticality…"
                                        hideSearch
                                        matchTriggerWidth
                                        forceDropdown
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                )}
                            />
                        </FormField>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-3">
                            <FormField label="RTO (hours)" hint="Recovery Time Objective" error={errors.rtoHours?.message}>
                                <Input id="bia-rto-input" type="text" inputMode="numeric" placeholder="e.g. 4" {...register('rtoHours', { setValueAs: numberSetValueAs })} />
                            </FormField>
                            <FormField label="RPO (hours)" hint="Recovery Point Objective" error={errors.rpoHours?.message}>
                                <Input id="bia-rpo-input" type="text" inputMode="numeric" placeholder="e.g. 1" {...register('rpoHours', { setValueAs: numberSetValueAs })} />
                            </FormField>
                            <FormField label="MTPD (hours)" hint="Max Tolerable Period of Disruption" error={errors.mtpdHours?.message}>
                                <Input id="bia-mtpd-input" type="text" inputMode="numeric" placeholder="e.g. 8" {...register('mtpdHours', { setValueAs: numberSetValueAs })} />
                            </FormField>
                        </div>
                        <FormField label="Notes" error={errors.notes?.message}>
                            <Textarea id="bia-notes-input" rows={3} placeholder="Single points of failure, recovery gaps, dependency notes…" {...register('notes')} />
                        </FormField>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating…' : 'Create BIA'}
                    </Button>
                </Modal.Footer>
            </Modal.Form>
        </Modal>
    );
}
