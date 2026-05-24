'use client';

/**
 * Vendor-create form hook — modal-form P1 extraction.
 *
 * State + submit + telemetry-free (vendor page didn't use telemetry).
 * Both the legacy `/vendors/new` page and the future
 * `<NewVendorModal>` (P2) compose this hook + `<NewVendorFields>`
 * identically. See
 * `docs/implementation-notes/2026-05-24-modal-form-architecture.md`.
 */
import { useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export interface NewVendorFormFields {
    name: string;
    legalName: string;
    websiteUrl: string;
    domain: string;
    country: string;
    description: string;
    criticality: string;
    status: string;
    dataAccess: string;
    isSubprocessor: boolean;
    nextReviewAt: string;
    contractRenewalAt: string;
}

export interface NewVendorFormReturn {
    fields: NewVendorFormFields;
    setField: <K extends keyof NewVendorFormFields>(
        key: K,
        value: NewVendorFormFields[K],
    ) => void;
    submitting: boolean;
    error: string | null;
    canSubmit: boolean;
    submit: () => Promise<void>;
    isDirty: boolean;
}

export interface UseNewVendorFormOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (vendor: any) => void;
}

export function useNewVendorForm({
    onSuccess,
}: UseNewVendorFormOptions): NewVendorFormReturn {
    const apiUrl = useTenantApiUrl();

    const [fields, setFields] = useState<NewVendorFormFields>({
        name: '',
        legalName: '',
        websiteUrl: '',
        domain: '',
        country: '',
        description: '',
        criticality: 'MEDIUM',
        status: 'ONBOARDING',
        dataAccess: '',
        isSubprocessor: false,
        nextReviewAt: '',
        contractRenewalAt: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const setField = <K extends keyof NewVendorFormFields>(
        key: K,
        value: NewVendorFormFields[K],
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
            criticality: fields.criticality,
            status: fields.status,
            isSubprocessor: fields.isSubprocessor,
        };
        if (fields.legalName) body.legalName = fields.legalName;
        if (fields.websiteUrl) body.websiteUrl = fields.websiteUrl;
        if (fields.domain) body.domain = fields.domain;
        if (fields.country) body.country = fields.country;
        if (fields.description) body.description = fields.description;
        if (fields.dataAccess) body.dataAccess = fields.dataAccess;
        if (fields.nextReviewAt) body.nextReviewAt = fields.nextReviewAt;
        if (fields.contractRenewalAt)
            body.contractRenewalAt = fields.contractRenewalAt;

        try {
            const res = await fetch(apiUrl('/vendors'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const vendor = await res.json();
                setIsDirty(false);
                onSuccess(vendor);
            } else {
                const err = await res.json().catch(() => ({}));
                setError(err.error?.message || 'Failed to create vendor');
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
