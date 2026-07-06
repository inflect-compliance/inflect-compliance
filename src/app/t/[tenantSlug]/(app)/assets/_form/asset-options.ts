import type { ComboboxOption } from '@/components/ui/combobox';

/**
 * Shared dropdown option sets for the asset create + edit forms.
 *
 * Classification uses the standard four-tier data-classification scheme;
 * data residency is a fixed jurisdiction set. Both are stored as plain
 * strings on the Asset (`classification` / `dataResidency`) — the options
 * just constrain the UI to the canonical values.
 *
 * i18n: the option VALUES are the stored canonical strings (unchanged); only
 * the display labels are localized. Each set is a factory taking
 * `t = useTranslations('assets')`; call it (memoized) in the form component.
 */
type T = (key: string) => string;

export function buildAssetClassificationOptions(t: T): ComboboxOption[] {
    return [
        { value: 'Public', label: t('formOptions.classification.Public') },
        { value: 'Internal', label: t('formOptions.classification.Internal') },
        { value: 'Confidential', label: t('formOptions.classification.Confidential') },
        { value: 'Restricted', label: t('formOptions.classification.Restricted') },
    ];
}

export function buildAssetDataResidencyOptions(t: T): ComboboxOption[] {
    return [
        { value: 'EU', label: t('formOptions.residency.EU') },
        { value: 'UK', label: t('formOptions.residency.UK') },
        { value: 'US', label: t('formOptions.residency.US') },
        { value: 'Other', label: t('formOptions.residency.Other') },
    ];
}

export function buildAssetStatusOptions(t: T): ComboboxOption[] {
    return [
        { value: 'ACTIVE', label: t('formOptions.status.ACTIVE') },
        { value: 'RETIRED', label: t('formOptions.status.RETIRED') },
    ];
}
