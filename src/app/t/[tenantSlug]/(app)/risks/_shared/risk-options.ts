import type { ComboboxOption } from '@/components/ui/combobox';
import {
    TREATMENT_DECISION_VALUES,
    TREATMENT_DECISION_META,
    type TreatmentDecisionValue,
} from '@/lib/risk-treatment-vocabulary';

// Re-export the shared vocabulary so existing UI imports keep resolving
// from `_shared/risk-options` while the mapping stays single-sourced in
// `@/lib/risk-treatment-vocabulary`.
export {
    TREATMENT_DECISION_VALUES,
    TREATMENT_DECISION_META,
    DECISION_TO_STRATEGY,
    canonicalTreatmentLabelEN,
} from '@/lib/risk-treatment-vocabulary';
export type {
    TreatmentDecisionValue,
    TreatmentStrategyValue,
} from '@/lib/risk-treatment-vocabulary';

/**
 * Shared risk-treatment decision options in the canonical vocabulary.
 * VALUES remain `TreatmentDecision` (enum-valid for `Risk.treatment`);
 * LABELS are the canonical Mitigate/Accept/Transfer/Avoid words so the
 * create modal, the detail edit modal, and the guided Step 4 read
 * identically. `t = useTranslations('risks')`.
 */
export function buildRiskTreatmentOptions(t: (key: string) => string): ComboboxOption[] {
    return TREATMENT_DECISION_VALUES.map((value) => ({
        value,
        label: t(TREATMENT_DECISION_META[value].labelKey),
    }));
}

/**
 * Canonical label for a persisted `Risk.treatment` value, for read-only
 * display (Overview, list table). Returns `null` for an unknown/empty
 * value so callers can fall back to their own "untreated" copy.
 */
export function canonicalTreatmentLabel(
    t: (key: string) => string,
    decision: string | null | undefined,
): string | null {
    if (!decision) return null;
    const meta = TREATMENT_DECISION_META[decision as TreatmentDecisionValue];
    return meta ? t(meta.labelKey) : decision;
}
