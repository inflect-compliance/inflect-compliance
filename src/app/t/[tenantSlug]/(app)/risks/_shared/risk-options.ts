import type { ComboboxOption } from '@/components/ui/combobox';

/**
 * Shared risk-treatment decision options — the ISO 27005 "4 T" set.
 * Used by both the create modal (NewRiskModal) and the detail edit modal
 * so the dropdown stays identical on both surfaces.
 *
 * i18n: `buildRiskTreatmentOptions(t)` resolves labels at render
 * (`t = useTranslations('risks')`); the enum VALUES are unchanged. Reuses
 * the existing `risks.treat/transfer/tolerate/avoid` copy.
 */
export function buildRiskTreatmentOptions(t: (key: string) => string): ComboboxOption[] {
    return [
        { value: 'TREAT', label: t('treat') },
        { value: 'TRANSFER', label: t('transfer') },
        { value: 'TOLERATE', label: t('tolerate') },
        { value: 'AVOID', label: t('avoid') },
    ];
}
