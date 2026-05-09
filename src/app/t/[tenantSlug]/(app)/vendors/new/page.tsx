'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import { Heading } from '@/components/ui/typography';

// Epic 55 — vendor status is a two-option choice ("onboarding" vs
// "active"). RadioGroup is the right primitive: both options are
// visible at a glance, the choice is a user decision (not a dropdown
// of many), and it reads as a pair of pills rather than a concealed
// menu.
const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ONBOARDING', label: 'Onboarding' },
];

// 4–5 option enums → Combobox (`hideSearch`) keeps the form compact
// and visually consistent with the other pickers on the page.
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

export default function CreateVendorPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();

    const [form, setForm] = useState({
        name: '', legalName: '', websiteUrl: '', domain: '', country: '',
        description: '', criticality: 'MEDIUM', status: 'ONBOARDING',
        dataAccess: '', isSubprocessor: false, nextReviewAt: '', contractRenewalAt: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError('');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
            name: form.name,
            criticality: form.criticality,
            status: form.status,
            isSubprocessor: form.isSubprocessor,
        };
        if (form.legalName) body.legalName = form.legalName;
        if (form.websiteUrl) body.websiteUrl = form.websiteUrl;
        if (form.domain) body.domain = form.domain;
        if (form.country) body.country = form.country;
        if (form.description) body.description = form.description;
        if (form.dataAccess) body.dataAccess = form.dataAccess;
        if (form.nextReviewAt) body.nextReviewAt = form.nextReviewAt;
        if (form.contractRenewalAt) body.contractRenewalAt = form.contractRenewalAt;

        const res = await fetch(apiUrl('/vendors'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) {
            const vendor = await res.json();
            router.push(tenantHref(`/vendors/${vendor.id}`));
        } else {
            const err = await res.json().catch(() => ({}));
            setError(err.error?.message || 'Failed to create vendor');
        }
        setSubmitting(false);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-section">
            <div className="flex items-center gap-compact">
                <Link href={tenantHref('/vendors')} className="text-content-muted hover:text-content-emphasis">← Back</Link>
                <Heading level={1}>New Vendor</Heading>
            </div>

            {error && (
                <div
                    role="alert"
                    className="rounded border border-border-error bg-bg-error text-content-error p-3"
                    id="create-vendor-error"
                >
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="glass-card space-y-default p-6" noValidate>
                {/* Name */}
                <FormField label="Vendor Name" required>
                    <Input
                        id="vendor-name-input"
                        value={form.name}
                        onChange={e => update('name', e.target.value)}
                        required
                    />
                </FormField>

                <div className="grid grid-cols-2 gap-default">
                    <FormField label="Legal Name">
                        <Input
                            id="vendor-legal-name"
                            value={form.legalName}
                            onChange={e => update('legalName', e.target.value)}
                        />
                    </FormField>
                    <FormField label="Domain">
                        <Input
                            id="vendor-domain"
                            value={form.domain}
                            onChange={e => update('domain', e.target.value)}
                            placeholder="e.g. aws.amazon.com"
                        />
                    </FormField>
                </div>

                <div className="grid grid-cols-2 gap-default">
                    <FormField label="Website URL">
                        <Input
                            id="vendor-website"
                            type="url"
                            value={form.websiteUrl}
                            onChange={e => update('websiteUrl', e.target.value)}
                        />
                    </FormField>
                    <FormField label="Country">
                        <Input
                            id="vendor-country"
                            value={form.country}
                            onChange={e => update('country', e.target.value)}
                        />
                    </FormField>
                </div>

                <FormField label="Description">
                    <Textarea
                        id="vendor-description"
                        className="h-20"
                        value={form.description}
                        onChange={e => update('description', e.target.value)}
                    />
                </FormField>

                <div className="grid grid-cols-3 gap-default">
                    <div>
                        <label className="block text-sm font-medium text-content-default mb-1">Status</label>
                        <RadioGroup
                            id="vendor-status-select"
                            value={form.status}
                            onValueChange={(v) => update('status', v)}
                            className="flex gap-default pt-1"
                        >
                            {STATUS_OPTIONS.map((o) => {
                                const itemId = `vendor-status-${o.value.toLowerCase()}`;
                                return (
                                    <div key={o.value} className="flex items-center gap-tight">
                                        <RadioGroupItem value={o.value} id={itemId} />
                                        <Label htmlFor={itemId} className="cursor-pointer">
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
                            selected={CRIT_OPTIONS.find(o => o.value === form.criticality) ?? null}
                            setSelected={(o) => update('criticality', o?.value ?? '')}
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
                            selected={DATA_ACCESS_OPTIONS.find(o => o.value === form.dataAccess) ?? null}
                            setSelected={(o) => update('dataAccess', o?.value ?? '')}
                            placeholder="— None —"
                            hideSearch
                            matchTriggerWidth
                            buttonProps={{ className: 'w-full' }}
                            caret
                        />
                    </FormField>
                </div>

                <div className="grid grid-cols-2 gap-default">
                    {/* Epic 58 — shared DatePickers; form state keeps
                        the YMD string shape the vendors API expects. */}
                    <FormField label="Next Review Date">
                        <DatePicker
                            id="vendor-next-review"
                            className="w-full"
                            placeholder="Select date"
                            clearable
                            align="start"
                            value={parseYMD(form.nextReviewAt)}
                            onChange={(next) =>
                                update('nextReviewAt', toYMD(next) ?? '')
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
                            value={parseYMD(form.contractRenewalAt)}
                            onChange={(next) =>
                                update('contractRenewalAt', toYMD(next) ?? '')
                            }
                            disabledDays={{
                                before: startOfUtcDay(new Date()),
                            }}
                            aria-label="Contract renewal date"
                        />
                    </FormField>
                </div>

                <label className="flex items-center gap-tight text-sm text-content-default">
                    <input type="checkbox" checked={form.isSubprocessor} onChange={e => update('isSubprocessor', e.target.checked)} id="vendor-subprocessor" />
                    This vendor is a sub-processor
                </label>

                <div className="flex gap-compact pt-2">
                    <Button type="submit" variant="primary" disabled={submitting || !form.name} id="create-vendor-submit">
                        {submitting ? 'Creating…' : '+ Vendor'}
                    </Button>
                    <Link href={tenantHref('/vendors')} className={buttonVariants({ variant: 'secondary' })}>Cancel</Link>
                </div>
            </form>
        </div>
    );
}
