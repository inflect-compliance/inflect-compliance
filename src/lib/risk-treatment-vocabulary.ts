/**
 * Canonical risk-treatment vocabulary (P1 — lifecycle unification).
 *
 * The product carried TWO treatment vocabularies that named the same
 * decision:
 *   • `Risk.treatment`            — TreatmentDecision: TREAT / TRANSFER /
 *                                   TOLERATE / AVOID (ISO 27005 "4 T"s)
 *   • `RiskTreatmentPlan.strategy` — TreatmentStrategy: MITIGATE / ACCEPT /
 *                                   TRANSFER / AVOID
 *
 * This module makes ONE vocabulary authoritative — the plan's
 * `TreatmentStrategy` wording (Mitigate / Accept / Transfer / Avoid) — and
 * is the single source of truth for the decision↔strategy mapping. The
 * persisted `Risk.treatment` enum VALUES are unchanged (no migration); we
 * only relabel them. Lives in `src/lib` so both the app-layer (reports)
 * and the UI (`_shared/risk-options.ts`) share one mapping.
 */

/** The persisted `Risk.treatment` enum values (unchanged). */
export type TreatmentDecisionValue = 'TREAT' | 'TRANSFER' | 'TOLERATE' | 'AVOID';
/** The canonical `RiskTreatmentPlan.strategy` enum values. */
export type TreatmentStrategyValue = 'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID';

/** Canonical Mitigate → Accept → Transfer → Avoid order. */
export const TREATMENT_DECISION_VALUES: readonly TreatmentDecisionValue[] = [
    'TREAT',
    'TOLERATE',
    'TRANSFER',
    'AVOID',
];

/**
 * The single source of truth: each persisted decision → its canonical
 * strategy + i18n label key (`t = useTranslations('risks')`) + English label.
 */
export const TREATMENT_DECISION_META: Record<
    TreatmentDecisionValue,
    { strategy: TreatmentStrategyValue; labelKey: string; labelEN: string }
> = {
    TREAT: { strategy: 'MITIGATE', labelKey: 'treatmentMitigate', labelEN: 'Mitigate' },
    TOLERATE: { strategy: 'ACCEPT', labelKey: 'treatmentAccept', labelEN: 'Accept' },
    TRANSFER: { strategy: 'TRANSFER', labelKey: 'treatmentTransfer', labelEN: 'Transfer' },
    AVOID: { strategy: 'AVOID', labelKey: 'treatmentAvoid', labelEN: 'Avoid' },
};

/** decision → strategy (e.g. seed a treatment plan from the risk's decision). */
export const DECISION_TO_STRATEGY: Record<TreatmentDecisionValue, TreatmentStrategyValue> = {
    TREAT: 'MITIGATE',
    TOLERATE: 'ACCEPT',
    TRANSFER: 'TRANSFER',
    AVOID: 'AVOID',
};

/**
 * i18n-free canonical label — for server-side report/PDF projections that
 * have no `next-intl` scope. Returns `null` for empty so callers keep
 * their own "untreated" copy.
 */
export function canonicalTreatmentLabelEN(
    decision: string | null | undefined,
): string | null {
    if (!decision) return null;
    return TREATMENT_DECISION_META[decision as TreatmentDecisionValue]?.labelEN ?? decision;
}
