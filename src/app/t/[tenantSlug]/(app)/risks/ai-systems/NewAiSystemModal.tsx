'use client';

/**
 * Register + classify an AI system. The classification section is the short
 * EU AI Act questionnaire — the answers drive the deterministic classifier on
 * the server (the tier is never set by the client). Leaving every question
 * blank yields MINIMAL risk (Art 95).
 */
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
import {
    ART5_PROHIBITED_PRACTICES,
    ANNEX_III_AREAS,
    ART50_TRANSPARENCY_CASES,
} from '@/lib/eu-ai-act/classification';

const NONE = { value: '', label: 'None / not applicable' };
const toOptions = (opts: readonly { id: string; clause: string; label: string }[]) => [
    NONE,
    ...opts.map((o) => ({ value: o.id, label: `${o.clause} — ${o.label}` })),
];

const ROLE_OPTIONS = [
    { value: 'DEPLOYER', label: 'Deployer — we use the system' },
    { value: 'PROVIDER', label: 'Provider — we develop / place it on the market' },
];
const PROHIBITED_OPTIONS = toOptions(ART5_PROHIBITED_PRACTICES);
const ANNEX_III_OPTIONS = toOptions(ANNEX_III_AREAS);
const ART50_OPTIONS = toOptions(ART50_TRANSPARENCY_CASES);

const formSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    provider: z.string().optional(),
    deploymentRole: z.enum(['DEPLOYER', 'PROVIDER']),
    purpose: z.string().optional(),
    useContext: z.string().optional(),
    prohibitedPractice: z.string().optional(),
    isAnnexIProductSafetyComponent: z.boolean().optional(),
    annexIIIArea: z.string().optional(),
    transparencyCase: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
    tenantSlug: string;
    onClose: () => void;
    onCreated: (id: string) => void | Promise<void>;
}

export function NewAiSystemModal({ tenantSlug, onClose, onCreated }: Props) {
    const [apiError, setApiError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            provider: '',
            deploymentRole: 'DEPLOYER',
            purpose: '',
            useContext: '',
            prohibitedPractice: '',
            isAnnexIProductSafetyComponent: false,
            annexIIIArea: '',
            transparencyCase: '',
        },
        mode: 'onTouched',
    });

    const onSubmit = async (values: FormValues) => {
        setApiError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/ai-systems`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: values.name,
                    provider: values.provider || undefined,
                    deploymentRole: values.deploymentRole,
                    purpose: values.purpose || undefined,
                    useContext: values.useContext || undefined,
                    classification: {
                        prohibitedPractice: values.prohibitedPractice || undefined,
                        isAnnexIProductSafetyComponent: values.isAnnexIProductSafetyComponent || undefined,
                        annexIIIArea: values.annexIIIArea || undefined,
                        transparencyCase: values.transparencyCase || undefined,
                    },
                }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? 'Failed to register AI system');
            }
            const created = (await res.json()) as { id: string };
            await onCreated(created.id);
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Failed to register AI system');
        }
    };

    const classificationSelect = (
        name: 'prohibitedPractice' | 'annexIIIArea' | 'transparencyCase',
        options: { value: string; label: string }[],
        placeholder: string,
    ) => (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <Combobox
                    id={`ai-${name}-input`}
                    name={name}
                    options={options}
                    selected={options.find((o) => o.value === (field.value ?? '')) ?? options[0]}
                    setSelected={(o) => field.onChange(o?.value ?? '')}
                    placeholder={placeholder}
                    matchTriggerWidth
                    forceDropdown
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            )}
        />
    );

    return (
        <Modal
            showModal
            setShowModal={(v) => {
                if (!v && !isSubmitting) onClose();
            }}
            size="lg"
            title="Register AI system"
            description="Register an AI system and classify its EU AI Act risk tier."
            preventDefaultClose={isSubmitting}
        >
            <Modal.Header title="Register AI system" description="Classify against the EU AI Act (Regulation (EU) 2024/1689)." />
            <Modal.Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body>
                    {apiError && (
                        <div className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                            {apiError}
                        </div>
                    )}
                    <div className="space-y-default">
                        <FormField label="System name" required error={errors.name?.message}>
                            <Input id="ai-name-input" type="text" placeholder="e.g. Candidate screening model" autoComplete="off" {...register('name')} />
                        </FormField>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <FormField label="Provider / vendor" error={errors.provider?.message}>
                                <Input id="ai-provider-input" type="text" placeholder="e.g. OpenAI, in-house" autoComplete="off" {...register('provider')} />
                            </FormField>
                            <FormField label="Our role" required error={errors.deploymentRole?.message}>
                                <Controller
                                    control={control}
                                    name="deploymentRole"
                                    render={({ field }) => (
                                        <Combobox
                                            id="ai-role-input"
                                            name="deploymentRole"
                                            options={ROLE_OPTIONS}
                                            selected={ROLE_OPTIONS.find((o) => o.value === field.value) ?? ROLE_OPTIONS[0]}
                                            setSelected={(o) => field.onChange(o?.value ?? 'DEPLOYER')}
                                            placeholder="Select role…"
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
                        <FormField label="Intended purpose" hint="Encrypted at rest" error={errors.purpose?.message}>
                            <Textarea id="ai-purpose-input" rows={2} placeholder="What the system is for…" {...register('purpose')} />
                        </FormField>
                        <FormField label="Use context" hint="Encrypted at rest" error={errors.useContext?.message}>
                            <Textarea id="ai-usecontext-input" rows={2} placeholder="Where and how it is deployed…" {...register('useContext')} />
                        </FormField>

                        <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 space-y-default">
                            <p className="text-sm font-medium text-content-emphasis">EU AI Act classification</p>
                            <p className="text-xs text-content-subtle">Answer what applies. Leave everything blank for a minimal-risk system. The tier is computed on the server.</p>
                            <FormField label="Article 5 — prohibited practice?">
                                {classificationSelect('prohibitedPractice', PROHIBITED_OPTIONS, 'None / not applicable')}
                            </FormField>
                            <FormField label="Annex III — high-risk use-case?">
                                {classificationSelect('annexIIIArea', ANNEX_III_OPTIONS, 'None / not applicable')}
                            </FormField>
                            <label className="flex items-center gap-tight text-sm text-content-default">
                                <input id="ai-annexi-input" type="checkbox" {...register('isAnnexIProductSafetyComponent')} />
                                Article 6(1) — safety component of an Annex I regulated product
                            </label>
                            <FormField label="Article 50 — transparency trigger?">
                                {classificationSelect('transparencyCase', ART50_OPTIONS, 'None / not applicable')}
                            </FormField>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Classifying…' : 'Register & classify'}
                    </Button>
                </Modal.Footer>
            </Modal.Form>
        </Modal>
    );
}
