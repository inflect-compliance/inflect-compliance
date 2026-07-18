'use client';

/**
 * Controlled field markup for the asset-create form. Same shape as
 * the legacy inline form on AssetsClient that this modal replaces.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { UserCombobox } from '@/components/ui/user-combobox';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import { parseYMD, toYMD } from '@/components/ui/date-picker/date-utils';
import { AssetCriticalityFields } from './AssetCriticalityFields';
import { AssetIdentityFields } from './AssetIdentityFields';
import {
    buildAssetClassificationOptions,
    buildAssetDataResidencyOptions,
    buildAssetStatusOptions,
} from './asset-options';
import type { NewAssetFormFields, NewAssetFormReturn } from './useNewAssetForm';

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
export const buildAssetTypeOptions = (t: (key: string) => string): ComboboxOption[] =>
    ASSET_TYPES.map((v) => ({ value: v, label: t(`assetTypes.${v}`) }));

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
    tenantSlug,
}: {
    form: NewAssetFormReturn;
    labels: NewAssetFieldsLabels;
    tenantSlug: string;
}) {
    const t = useTranslations('assets');
    const tOpt = (k: string) => t(k as Parameters<typeof t>[0]);
    const ASSET_TYPE_OPTIONS = useMemo(() => buildAssetTypeOptions(tOpt), [t]);
    const classificationOptions = buildAssetClassificationOptions(tOpt);
    const residencyOptions = buildAssetDataResidencyOptions(tOpt);
    const statusOptions = buildAssetStatusOptions(tOpt);
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
                            form.setField(
                                'type',
                                (o?.value ?? 'SYSTEM') as NewAssetFormFields['type'],
                            )
                        }
                        placeholder={t('form.typePlaceholder')}
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
                <FormField label={labels.classification}>
                    <Combobox
                        id="asset-classification-input"
                        name="classification"
                        options={classificationOptions}
                        selected={
                            classificationOptions.find(
                                (o) => o.value === form.fields.classification,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField('classification', o?.value ?? '')
                        }
                        placeholder={t('form.selectClassification')}
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={labels.owner}>
                    <UserCombobox
                        id="asset-owner-input"
                        tenantSlug={tenantSlug}
                        selectedId={form.fields.ownerUserId || null}
                        onChange={(userId) =>
                            form.setField('ownerUserId', userId ?? '')
                        }
                        forceDropdown
                        matchTriggerWidth
                        placeholder={t('form.unassigned')}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={t('form.status')}>
                    <Combobox
                        id="asset-status-select"
                        name="status"
                        options={statusOptions}
                        selected={
                            statusOptions.find(
                                (o) => o.value === form.fields.status,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField(
                                'status',
                                (o?.value ?? 'ACTIVE') as NewAssetFormFields['status'],
                            )
                        }
                        placeholder={t('form.statusPlaceholder')}
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
                <FormField label={labels.dataResidency}>
                    <Combobox
                        id="asset-data-residency-input"
                        name="dataResidency"
                        options={residencyOptions}
                        selected={
                            residencyOptions.find(
                                (o) => o.value === form.fields.dataResidency,
                            ) ?? null
                        }
                        setSelected={(o) =>
                            form.setField('dataResidency', o?.value ?? '')
                        }
                        placeholder={t('form.selectResidency')}
                        hideSearch
                        matchTriggerWidth
                        buttonProps={{ className: 'w-full' }}
                        caret
                    />
                </FormField>
            </div>

            {/* CIA triad → asset criticality (sliders + high-water-mark
                score). min/max=1..5 matches the ISO 27005 impact scale. */}
            <AssetCriticalityFields
                confidentiality={form.fields.confidentiality}
                integrity={form.fields.integrity}
                availability={form.fields.availability}
                onChange={(key, value) => form.setField(key, value)}
            />

            {/* Product identity → CVE→asset matching. */}
            <AssetIdentityFields
                idPrefix="asset-new"
                values={{
                    cpe: form.fields.cpe ?? '',
                    vendor: form.fields.vendor ?? '',
                    product: form.fields.product ?? '',
                    version: form.fields.version ?? '',
                }}
                onChange={(key, value) => form.setField(key, value)}
            />

            {/* Context — external reference + dependencies / business
                processes / retention. Persisted by the API but previously
                surfaced in no form. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
                <FormField label={t('form.externalRef')}>
                    <Input
                        id="asset-external-ref-input"
                        value={form.fields.externalRef ?? ''}
                        onChange={(e) => form.setField('externalRef', e.target.value)}
                        placeholder={t('form.externalRefPlaceholder')}
                    />
                </FormField>
                <FormField label={t('form.retention')} hint={t('form.retentionNote')}>
                    <Input
                        id="asset-retention-input"
                        value={form.fields.retention ?? ''}
                        onChange={(e) => form.setField('retention', e.target.value)}
                        placeholder={t('form.retentionPlaceholder')}
                    />
                </FormField>
                <FormField label={t('form.retentionUntil')} hint={t('form.retentionUntilNote')}>
                    <DatePicker
                        clearable
                        placeholder={t('form.retentionUntilPlaceholder')}
                        value={form.fields.retentionUntil ? parseYMD(form.fields.retentionUntil) : null}
                        onChange={(d) => form.setField('retentionUntil', toYMD(d) ?? '')}
                    />
                </FormField>
                <FormField label={t('form.dependencies')} hint={t('form.dependenciesNote')}>
                    <Input
                        id="asset-dependencies-input"
                        value={form.fields.dependencies ?? ''}
                        onChange={(e) => form.setField('dependencies', e.target.value)}
                        placeholder={t('form.dependenciesPlaceholder')}
                    />
                </FormField>
                <FormField label={t('form.businessProcesses')} hint={t('form.businessProcessesNote')}>
                    <Input
                        id="asset-business-processes-input"
                        value={form.fields.businessProcesses ?? ''}
                        onChange={(e) => form.setField('businessProcesses', e.target.value)}
                        placeholder={t('form.businessProcessesPlaceholder')}
                    />
                </FormField>
            </div>
        </>
    );
}
