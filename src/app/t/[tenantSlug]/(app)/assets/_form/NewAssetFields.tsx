'use client';

/**
 * Controlled field markup for the asset-create form. Same shape as
 * the legacy inline form on AssetsClient that this modal replaces.
 */
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NumberStepper } from '@/components/ui/number-stepper';
import type { NewAssetFormReturn } from './useNewAssetForm';

const ASSET_TYPES = [
    'INFORMATION',
    'APPLICATION',
    'SYSTEM',
    'SERVICE',
    'DATA_STORE',
    'INFRASTRUCTURE',
    'VENDOR',
    'PROCESS',
    'PEOPLE_PROCESS',
    'OTHER',
];
const ASSET_TYPE_OPTIONS: ComboboxOption[] = ASSET_TYPES.map((t) => ({
    value: t,
    label: t.replace(/_/g, ' '),
}));

export interface NewAssetFieldsLabels {
    name: string;
    type: string;
    classification: string;
    classificationPlaceholder: string;
    owner: string;
    location: string;
    dataResidency: string;
    residencyPlaceholder: string;
    confidentiality: string;
    integrity: string;
    availability: string;
}

export function NewAssetFields({
    form,
    labels,
}: {
    form: NewAssetFormReturn;
    labels: NewAssetFieldsLabels;
}) {
    return (
        <>
            <FormField label={labels.name} required>
                <Input
                    id="asset-name-input"
                    value={form.fields.name}
                    onChange={(e) => form.setField('name', e.target.value)}
                    required
                />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={labels.type}>
                    <Combobox
                        id="asset-type-select"
                        name="type"
                        options={ASSET_TYPE_OPTIONS}
                        selected={
                            ASSET_TYPE_OPTIONS.find(
                                (o) => o.value === form.fields.type,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField('type', o?.value ?? 'SYSTEM')
                        }
                        placeholder="Select type…"
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
                <FormField label={labels.classification}>
                    <Input
                        id="asset-classification-input"
                        value={form.fields.classification}
                        onChange={(e) =>
                            form.setField('classification', e.target.value)
                        }
                        placeholder={labels.classificationPlaceholder}
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={labels.owner}>
                    <Input
                        id="asset-owner-input"
                        value={form.fields.owner}
                        onChange={(e) => form.setField('owner', e.target.value)}
                    />
                </FormField>
                <FormField label={labels.location}>
                    <Input
                        id="asset-location-input"
                        value={form.fields.location}
                        onChange={(e) =>
                            form.setField('location', e.target.value)
                        }
                    />
                </FormField>
            </div>

            <FormField label={labels.dataResidency}>
                <Input
                    id="asset-data-residency-input"
                    value={form.fields.dataResidency}
                    onChange={(e) =>
                        form.setField('dataResidency', e.target.value)
                    }
                    placeholder={labels.residencyPlaceholder}
                />
            </FormField>

            {/* Epic 60 — NumberStepper on the CIA triple. min/max=1..5
                matches the ISO 27005 impact scale. */}
            <div className="grid grid-cols-3 gap-default">
                <FormField label={labels.confidentiality}>
                    <NumberStepper
                        id="asset-confidentiality"
                        size="sm"
                        ariaLabel={labels.confidentiality}
                        min={1}
                        max={5}
                        value={form.fields.confidentiality}
                        onChange={(v) => form.setField('confidentiality', v)}
                    />
                </FormField>
                <FormField label={labels.integrity}>
                    <NumberStepper
                        id="asset-integrity"
                        size="sm"
                        ariaLabel={labels.integrity}
                        min={1}
                        max={5}
                        value={form.fields.integrity}
                        onChange={(v) => form.setField('integrity', v)}
                    />
                </FormField>
                <FormField label={labels.availability}>
                    <NumberStepper
                        id="asset-availability"
                        size="sm"
                        ariaLabel={labels.availability}
                        min={1}
                        max={5}
                        value={form.fields.availability}
                        onChange={(v) => form.setField('availability', v)}
                    />
                </FormField>
            </div>
        </>
    );
}
