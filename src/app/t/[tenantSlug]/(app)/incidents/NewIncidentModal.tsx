'use client';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { UserCombobox } from '@/components/ui/user-combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import { SEVERITY_LABELS, INCIDENT_TYPE_LABELS } from './filter-defs';

const SEVERITY_OPTIONS: ComboboxOption[] = Object.entries(SEVERITY_LABELS).map(
    ([value, label]) => ({ value, label }),
);
const TYPE_OPTIONS: ComboboxOption[] = Object.entries(INCIDENT_TYPE_LABELS).map(
    ([value, label]) => ({ value, label }),
);

const formSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    incidentType: z.enum(['RANSOMWARE', 'DATA_BREACH', 'DDOS', 'UNAUTHORIZED_ACCESS', 'OTHER']),
    ownerUserId: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export interface NewIncidentModalProps {
    open: boolean;
    onClose: () => void;
    tenantSlug: string;
    onCreated: (incidentId: string) => void | Promise<void>;
}

export function NewIncidentModal({ open, onClose, tenantSlug, onCreated }: NewIncidentModalProps) {
    const [apiError, setApiError] = useState<string | null>(null);
    const [detectedAt, setDetectedAt] = useState<Date | undefined>(new Date());

    const {
        register,
        handleSubmit,
        control,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { title: '', description: '', severity: 'MEDIUM', incidentType: 'OTHER', ownerUserId: '' },
        mode: 'onTouched',
    });

    // eslint-disable-next-line react-hooks/incompatible-library
    const titleValue = watch('title');

    const onSubmit = async (values: FormValues) => {
        setApiError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/incidents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: values.title,
                    description: values.description || undefined,
                    severity: values.severity,
                    incidentType: values.incidentType,
                    ownerUserId: values.ownerUserId || undefined,
                    detectedAt: detectedAt ? detectedAt.toISOString() : undefined,
                }),
            });
            if (!res.ok) throw new Error('Failed to open incident');
            const created = (await res.json()) as { id: string };
            await onCreated(created.id);
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Failed to open incident');
        }
    };

    return (
        <Modal
            showModal={open}
            setShowModal={(v) => {
                if (!v && !isSubmitting) onClose();
            }}
            size="lg"
            title="Open incident"
            description="Record a live security incident to start the NIS2 Article 23 response."
            preventDefaultClose={isSubmitting}
        >
            <Modal.Header
                title="Open incident"
                description="Record a live security incident to start the NIS2 Article 23 response clock."
            />
            <Modal.Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body>
                    {apiError && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-incident-error"
                            role="alert"
                        >
                            {apiError}
                        </div>
                    )}
                    <div className="space-y-default">
                        <FormField label="Title" required error={errors.title?.message}>
                            <Input
                                id="incident-title-input"
                                type="text"
                                placeholder="e.g. Ransomware on the billing cluster"
                                autoComplete="off"
                                {...register('title')}
                            />
                        </FormField>
                        <FormField label="Description" error={errors.description?.message}>
                            <Textarea
                                id="incident-description-input"
                                rows={3}
                                placeholder="What happened, what's affected, what's known so far"
                                {...register('description')}
                            />
                        </FormField>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <FormField label="Severity" required error={errors.severity?.message}>
                                <Controller
                                    control={control}
                                    name="severity"
                                    render={({ field }) => (
                                        <Combobox
                                            id="incident-severity-input"
                                            name="severity"
                                            options={SEVERITY_OPTIONS}
                                            selected={SEVERITY_OPTIONS.find((o) => o.value === field.value) ?? null}
                                            setSelected={(o) => field.onChange(o?.value ?? 'MEDIUM')}
                                            placeholder="Select severity…"
                                            hideSearch
                                            matchTriggerWidth
                                            forceDropdown
                                            buttonProps={{ className: 'w-full' }}
                                            caret
                                        />
                                    )}
                                />
                            </FormField>
                            <FormField label="Type" required error={errors.incidentType?.message}>
                                <Controller
                                    control={control}
                                    name="incidentType"
                                    render={({ field }) => (
                                        <Combobox
                                            id="incident-type-input"
                                            name="incidentType"
                                            options={TYPE_OPTIONS}
                                            selected={TYPE_OPTIONS.find((o) => o.value === field.value) ?? null}
                                            setSelected={(o) => field.onChange(o?.value ?? 'OTHER')}
                                            placeholder="Select type…"
                                            hideSearch
                                            matchTriggerWidth
                                            forceDropdown
                                            buttonProps={{ className: 'w-full' }}
                                            caret
                                        />
                                    )}
                                />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <FormField label="Detected at" hint="The clock that drives the 24h / 72h / 1-month deadlines.">
                                <DatePicker
                                    value={detectedAt ?? null}
                                    onChange={(d) => setDetectedAt(d ?? undefined)}
                                    placeholder="When was it detected"
                                />
                            </FormField>
                            <FormField label="Incident commander">
                                <Controller
                                    control={control}
                                    name="ownerUserId"
                                    render={({ field }) => (
                                        <UserCombobox
                                            tenantSlug={tenantSlug}
                                            selectedId={field.value || null}
                                            onChange={(id) => field.onChange(id ?? '')}
                                            forceDropdown
                                            matchTriggerWidth
                                            placeholder="Assign an owner"
                                            id="incident-owner-input"
                                        />
                                    )}
                                />
                            </FormField>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        id="new-incident-cancel-btn"
                        onClick={() => {
                            if (!isSubmitting) onClose();
                        }}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        id="create-incident-btn"
                        disabled={isSubmitting || titleValue.trim().length === 0}
                    >
                        {isSubmitting ? 'Creating…' : 'Create incident'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
