'use client';

/**
 * Asset-create form hook — modal-form follow-up (assets-create was
 * missed by the original modal-form P2, which scoped assets-EDIT
 * only). Same shape as `useNewVendorForm`: state + dirty tracking
 * + canSubmit gate + telemetry-free POST.
 *
 * Composed by `<NewAssetModal>` (which renders the modal shell + the
 * shared `<NewAssetFields>` markup).
 */
import { useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export interface NewAssetFormFields {
    name: string;
    type: string;
    classification: string;
    owner: string;
    location: string;
    dataResidency: string;
    confidentiality: number;
    integrity: number;
    availability: number;
}

export interface NewAssetFormReturn {
    fields: NewAssetFormFields;
    setField: <K extends keyof NewAssetFormFields>(
        key: K,
        value: NewAssetFormFields[K],
    ) => void;
    submitting: boolean;
    error: string | null;
    canSubmit: boolean;
    submit: () => Promise<void>;
    isDirty: boolean;
}

export interface UseNewAssetFormOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (asset: any) => void;
}

const INITIAL: NewAssetFormFields = {
    name: '',
    type: 'SYSTEM',
    classification: '',
    owner: '',
    location: '',
    dataResidency: '',
    confidentiality: 3,
    integrity: 3,
    availability: 3,
};

export function useNewAssetForm({
    onSuccess,
}: UseNewAssetFormOptions): NewAssetFormReturn {
    const apiUrl = useTenantApiUrl();

    const [fields, setFields] = useState<NewAssetFormFields>(INITIAL);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const setField = <K extends keyof NewAssetFormFields>(
        key: K,
        value: NewAssetFormFields[K],
    ) => {
        setFields((f) => ({ ...f, [key]: value }));
        setIsDirty(true);
    };

    const canSubmit = fields.name.trim().length > 0 && !submitting;

    const submit = async (): Promise<void> => {
        setSubmitting(true);
        setError(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
            name: fields.name,
            type: fields.type,
            confidentiality: fields.confidentiality,
            integrity: fields.integrity,
            availability: fields.availability,
        };
        if (fields.classification) body.classification = fields.classification;
        if (fields.owner) body.owner = fields.owner;
        if (fields.location) body.location = fields.location;
        if (fields.dataResidency) body.dataResidency = fields.dataResidency;

        try {
            const res = await fetch(apiUrl('/assets'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const asset = await res.json();
                setIsDirty(false);
                setFields(INITIAL);
                onSuccess(asset);
            } else {
                const err = await res.json().catch(() => ({}));
                setError(err.error?.message || 'Failed to create asset');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return {
        fields,
        setField,
        submitting,
        error,
        canSubmit,
        submit,
        isDirty,
    };
}
