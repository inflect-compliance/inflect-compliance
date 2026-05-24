'use client';

/**
 * Controlled field markup for the vendor-create form.
 */
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import type { NewVendorFormReturn } from './useNewVendorForm';

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ONBOARDING', label: 'Onboarding' },
];

const CRIT_OPTIONS: ComboboxOption[] = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];
const DATA_ACCESS_OPTIONS: ComboboxOption[] = [
    { value: 'NONE', label: 'None' },
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
];

export function NewVendorFields({ form }: { form: NewVendorFormReturn }) {
    return (
        <>
            <FormField label="Vendor Name" required>
                <Input
                    id="vendor-name-input"
                    value={form.fields.name}
                    onChange={(e) => form.setField('name', e.target.value)}
                    required
                />
            </FormField>

            <div className="grid grid-cols-2 gap-default">
                <FormField label="Legal Name">
                    <Input
                        id="vendor-legal-name"
                        value={form.fields.legalName}
                        onChange={(e) => form.setField('legalName', e.target.value)}
                    />
                </FormField>
                <FormField label="Domain">
                    <Input
                        id="vendor-domain"
                        value={form.fields.domain}
                        onChange={(e) => form.setField('domain', e.target.value)}
                        placeholder="e.g. aws.amazon.com"
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-default">
                <FormField label="Website URL">
                    <Input
                        id="vendor-website"
                        type="url"
                        value={form.fields.websiteUrl}
                        onChange={(e) => form.setField('websiteUrl', e.target.value)}
                    />
                </FormField>
                <FormField label="Country">
                    <Input
                        id="vendor-country"
                        value={form.fields.country}
                        onChange={(e) => form.setField('country', e.target.value)}
                    />
                </FormField>
            </div>

            <FormField label="Description">
                <Textarea
                    id="vendor-description"
                    className="h-20"
                    value={form.fields.description}
                    onChange={(e) => form.setField('description', e.target.value)}
                />
            </FormField>

            <div className="grid grid-cols-3 gap-default">
                <div>
                    <label className="block text-sm font-medium text-content-default mb-1">
                        Status
                    </label>
                    <RadioGroup
                        id="vendor-status-select"
                        value={form.fields.status}
                        onValueChange={(v) => form.setField('status', v)}
                        className="flex gap-default pt-1"
                    >
                        {STATUS_OPTIONS.map((o) => {
                            const itemId = `vendor-status-${o.value.toLowerCase()}`;
                            return (
                                <div
                                    key={o.value}
                                    className="flex items-center gap-tight"
                                >
                                    <RadioGroupItem value={o.value} id={itemId} />
                                    <Label
                                        htmlFor={itemId}
                                        className="cursor-pointer"
                                    >
                                        {o.label}
                                    </Label>
                                </div>
                            );
                        })}
                    </RadioGroup>
                </div>
                <FormField label="Criticality">
                    <Combobox
                        id="vendor-criticality-select"
                        name="criticality"
                        options={CRIT_OPTIONS}
                        selected={
                            CRIT_OPTIONS.find(
                                (o) => o.value === form.fields.criticality,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField('criticality', o?.value ?? '')
                        }
                        placeholder="Select criticality…"
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
                <FormField label="Data Access">
                    <Combobox
                        id="vendor-data-access"
                        name="dataAccess"
                        options={DATA_ACCESS_OPTIONS}
                        selected={
                            DATA_ACCESS_OPTIONS.find(
                                (o) => o.value === form.fields.dataAccess,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField('dataAccess', o?.value ?? '')
                        }
                        placeholder="— None —"
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-default">
                <FormField label="Next Review Date">
                    <DatePicker
                        id="vendor-next-review"
                        className="w-full"
                        placeholder="Select date"
                        clearable
                        align="start"
                        value={parseYMD(form.fields.nextReviewAt)}
                        onChange={(next) =>
                            form.setField('nextReviewAt', toYMD(next) ?? '')
                        }
                        disabledDays={{
                            before: startOfUtcDay(new Date()),
                        }}
                        aria-label="Next review date"
                    />
                </FormField>
                <FormField label="Contract Renewal Date">
                    <DatePicker
                        id="vendor-contract-renewal"
                        className="w-full"
                        placeholder="Select date"
                        clearable
                        align="start"
                        value={parseYMD(form.fields.contractRenewalAt)}
                        onChange={(next) =>
                            form.setField('contractRenewalAt', toYMD(next) ?? '')
                        }
                        disabledDays={{
                            before: startOfUtcDay(new Date()),
                        }}
                        aria-label="Contract renewal date"
                    />
                </FormField>
            </div>

            <label className="flex items-center gap-tight text-sm text-content-default">
                <input
                    type="checkbox"
                    checked={form.fields.isSubprocessor}
                    onChange={(e) =>
                        form.setField('isSubprocessor', e.target.checked)
                    }
                    id="vendor-subprocessor"
                />
                This vendor is a sub-processor
            </label>
        </>
    );
}
