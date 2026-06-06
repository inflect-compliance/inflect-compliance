import type { ComboboxOption } from '@/components/ui/combobox';

/**
 * Shared risk-treatment decision options — the ISO 27005 "4 T" set.
 * Used by both the create modal (NewRiskModal) and the detail edit modal
 * so the dropdown stays identical on both surfaces.
 */
export const RISK_TREATMENT_OPTIONS: ComboboxOption[] = [
    { value: 'TREAT', label: 'Treat' },
    { value: 'TRANSFER', label: 'Transfer' },
    { value: 'TOLERATE', label: 'Tolerate' },
    { value: 'AVOID', label: 'Avoid' },
];
