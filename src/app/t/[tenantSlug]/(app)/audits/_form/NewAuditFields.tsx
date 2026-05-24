'use client';

/**
 * Controlled field markup for the audit-create form. Same shape as
 * the legacy inline form on AuditsClient that this modal replaces:
 * title (required), auditors (free text), scope (textarea). The
 * `generateChecklist` toggle stays true by default — pre-modal
 * behaviour kept the flag hardcoded; auditors who want a blank
 * audit can clear the checklist after creation.
 */
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { NewAuditFormReturn } from './useNewAuditForm';

export interface NewAuditFieldsLabels {
    auditTitle: string;
    auditors: string;
    scope: string;
}

export function NewAuditFields({
    form,
    labels,
}: {
    form: NewAuditFormReturn;
    labels: NewAuditFieldsLabels;
}) {
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={labels.auditTitle} required>
                    <Input
                        id="audit-title-input"
                        value={form.fields.title}
                        onChange={(e) => form.setField('title', e.target.value)}
                        required
                    />
                </FormField>
                <FormField label={labels.auditors}>
                    <Input
                        id="audit-auditors-input"
                        value={form.fields.auditors}
                        onChange={(e) =>
                            form.setField('auditors', e.target.value)
                        }
                    />
                </FormField>
            </div>

            <FormField label={labels.scope}>
                <Textarea
                    id="audit-scope-input"
                    className="h-24"
                    value={form.fields.scope}
                    onChange={(e) => form.setField('scope', e.target.value)}
                />
            </FormField>
        </>
    );
}
