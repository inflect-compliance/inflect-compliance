'use client';

/**
 * Audit-create form hook — modal-form follow-up (audits was missed by
 * the original P2 which scoped tasks / policies / vendors / assets-EDIT
 * only). Same shape as `useNewVendorForm`: state + dirty tracking +
 * canSubmit gate + telemetry-free POST.
 *
 * Composed by `<NewAuditModal>` (which renders the modal shell + the
 * shared `<NewAuditFields>` markup).
 */
import { useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export interface NewAuditFormFields {
    title: string;
    scope: string;
    auditors: string;
    generateChecklist: boolean;
}

export interface NewAuditFormReturn {
    fields: NewAuditFormFields;
    setField: <K extends keyof NewAuditFormFields>(
        key: K,
        value: NewAuditFormFields[K],
    ) => void;
    submitting: boolean;
    error: string | null;
    canSubmit: boolean;
    submit: () => Promise<void>;
    isDirty: boolean;
}

export interface UseNewAuditFormOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSuccess: (audit: any) => void;
}

const INITIAL: NewAuditFormFields = {
    title: '',
    scope: '',
    auditors: '',
    generateChecklist: true,
};

export function useNewAuditForm({
    onSuccess,
}: UseNewAuditFormOptions): NewAuditFormReturn {
    const apiUrl = useTenantApiUrl();

    const [fields, setFields] = useState<NewAuditFormFields>(INITIAL);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const setField = <K extends keyof NewAuditFormFields>(
        key: K,
        value: NewAuditFormFields[K],
    ) => {
        setFields((f) => ({ ...f, [key]: value }));
        setIsDirty(true);
    };

    const canSubmit = fields.title.trim().length > 0 && !submitting;

    const submit = async (): Promise<void> => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(apiUrl('/audits'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: fields.title,
                    scope: fields.scope,
                    auditors: fields.auditors,
                    generateChecklist: fields.generateChecklist,
                }),
            });
            if (res.ok) {
                const audit = await res.json();
                setIsDirty(false);
                setFields(INITIAL);
                onSuccess(audit);
            } else {
                const err = await res.json().catch(() => ({}));
                setError(err.error?.message || 'Failed to create audit');
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
