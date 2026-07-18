'use client';

/**
 * Controlled field markup for the asset-edit form.
 *
 * Composes the same six fields the legacy inline-edit panel exposed.
 * The detail page renders this inline (existing behaviour); the P2
 * `<EditAssetModal>` renders it inside Modal.Body. State + submit
 * live in `useEditAssetForm`.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { UserCombobox } from '@/components/ui/user-combobox';
import { AssetCriticalityFields } from './AssetCriticalityFields';
import { AssetIdentityFields } from './AssetIdentityFields';
import {
    buildAssetClassificationOptions,
    buildAssetDataResidencyOptions,
} from './asset-options';
import type { EditAssetFormReturn } from './useEditAssetForm';

const TYPES = [
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
export function EditAssetFields({
    form,
    tenantSlug,
}: {
    form: EditAssetFormReturn;
    tenantSlug: string;
}) {
    const t = useTranslations('assets');
    const STATUS_OPTIONS: ComboboxOption[] = [
        { value: 'ACTIVE', label: t('statusOption.ACTIVE') },
        { value: 'RETIRED', label: t('statusOption.RETIRED') },
    ];
    const tOpt = (k: string) => t(k as Parameters<typeof t>[0]);
    const TYPE_OPTIONS = useMemo(
        () => TYPES.map((v) => ({ value: v, label: tOpt(`assetTypes.${v}`) })),
        [t],
    );
    const classificationOptions = buildAssetClassificationOptions(tOpt);
    const residencyOptions = buildAssetDataResidencyOptions(tOpt);
    return (
        <>
        <div className="grid grid-cols-2 gap-default">
            <div>
                <label className="input-label">{t('form.nameRequired')}</label>
                <input
                    className="input"
                    value={form.fields.name}
                    onChange={(e) => form.setField('name', e.target.value)}
                />
            </div>
            <div>
                <label className="input-label">{t('type')}</label>
                <Combobox
                    hideSearch
                    selected={
                        TYPE_OPTIONS.find((o) => o.value === form.fields.type) ??
                        null
                    }
                    setSelected={(opt) =>
                        form.setField('type', opt?.value ?? 'SYSTEM')
                    }
                    options={TYPE_OPTIONS}
                    matchTriggerWidth
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            </div>
            <div>
                <label className="input-label">{t('form.status')}</label>
                <Combobox
                    hideSearch
                    selected={
                        STATUS_OPTIONS.find(
                            (o) => o.value === form.fields.status,
                        ) ?? null
                    }
                    setSelected={(opt) =>
                        form.setField('status', opt?.value ?? 'ACTIVE')
                    }
                    options={STATUS_OPTIONS}
                    matchTriggerWidth
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            </div>
            <div>
                <label className="input-label">{t('owner')}</label>
                <UserCombobox
                    tenantSlug={tenantSlug}
                    selectedId={form.fields.ownerUserId || null}
                    onChange={(userId) =>
                        form.setField('ownerUserId', userId ?? '')
                    }
                    forceDropdown
                    matchTriggerWidth
                    id="asset-assignee"
                    placeholder={t('form.unassigned')}
                />
            </div>
            <div>
                <label className="input-label">{t('classification')}</label>
                <Combobox
                    hideSearch
                    selected={
                        classificationOptions.find(
                            (o) => o.value === form.fields.classification,
                        ) ?? null
                    }
                    setSelected={(opt) =>
                        form.setField('classification', opt?.value ?? '')
                    }
                    options={classificationOptions}
                    placeholder={t('form.selectClassification')}
                    matchTriggerWidth
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            </div>
            <div>
                <label className="input-label">{t('location')}</label>
                <input
                    className="input"
                    value={form.fields.location}
                    onChange={(e) => form.setField('location', e.target.value)}
                />
            </div>
            <div>
                <label className="input-label">{t('dataResidency')}</label>
                <Combobox
                    hideSearch
                    selected={
                        residencyOptions.find(
                            (o) => o.value === form.fields.dataResidency,
                        ) ?? null
                    }
                    setSelected={(opt) =>
                        form.setField('dataResidency', opt?.value ?? '')
                    }
                    options={residencyOptions}
                    placeholder={t('form.selectResidency')}
                    matchTriggerWidth
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            </div>
        </div>
        <AssetCriticalityFields
            idPrefix="asset-edit"
            confidentiality={form.fields.confidentiality}
            integrity={form.fields.integrity}
            availability={form.fields.availability}
            onChange={(key, value) => form.setField(key, value)}
        />
        {/* Product identity → CVE→asset matching. */}
        <AssetIdentityFields
            idPrefix="asset-edit"
            values={{
                cpe: form.fields.cpe ?? '',
                vendor: form.fields.vendor ?? '',
                product: form.fields.product ?? '',
                version: form.fields.version ?? '',
            }}
            onChange={(key, value) => form.setField(key, value)}
        />
        {/* Context — external reference + dependencies / business processes /
            retention. Persisted by the API; previously surfaced in no form. */}
        <div className="grid grid-cols-2 gap-default">
            <div>
                <label className="input-label">{t('form.externalRef')}</label>
                <input
                    className="input"
                    id="asset-edit-external-ref"
                    value={form.fields.externalRef ?? ''}
                    onChange={(e) => form.setField('externalRef', e.target.value)}
                    placeholder={t('form.externalRefPlaceholder')}
                />
            </div>
            <div>
                <label className="input-label">{t('form.retention')}</label>
                <input
                    className="input"
                    id="asset-edit-retention"
                    value={form.fields.retention ?? ''}
                    onChange={(e) => form.setField('retention', e.target.value)}
                    placeholder={t('form.retentionPlaceholder')}
                />
            </div>
            <div>
                <label className="input-label">{t('form.dependencies')}</label>
                <input
                    className="input"
                    id="asset-edit-dependencies"
                    value={form.fields.dependencies ?? ''}
                    onChange={(e) => form.setField('dependencies', e.target.value)}
                    placeholder={t('form.dependenciesPlaceholder')}
                />
                <p className="mt-1 text-xs text-content-subtle">{t('form.dependenciesNote')}</p>
            </div>
            <div>
                <label className="input-label">{t('form.businessProcesses')}</label>
                <input
                    className="input"
                    id="asset-edit-business-processes"
                    value={form.fields.businessProcesses ?? ''}
                    onChange={(e) => form.setField('businessProcesses', e.target.value)}
                    placeholder={t('form.businessProcessesPlaceholder')}
                />
                <p className="mt-1 text-xs text-content-subtle">{t('form.businessProcessesNote')}</p>
            </div>
        </div>
        </>
    );
}
