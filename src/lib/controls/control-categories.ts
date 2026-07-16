/**
 * Canonical control-category vocabulary — the four ISO/IEC 27002:2022 themes.
 *
 * ONE editable vocabulary across the three surfaces that let a user set a
 * control's category: the create modal (`NewControlModal`), the list
 * quick-edit panel (`ControlEditPanel`), and the detail edit modal
 * (`EditControlModal`). Persisted on `Control.category` (a plain `String?`).
 *
 * Historically these three surfaces disagreed — the create modal + quick-edit
 * used a free-text list ("Access Control", "Encryption", …) while the detail
 * editor used these four themes — so opening a free-text control in the detail
 * editor resolved to "None" and a save could silently coarsen or clear it.
 *
 * The fix has two halves:
 *   1. All three surfaces build their options from {@link buildCategoryOptions}
 *      (the four themes, plus the current value preserved as an option when it
 *      isn't a theme) so a legacy / framework-seeded / custom value is shown
 *      HONESTLY and round-trips untouched — never silently dropped.
 *   2. Migration `2026...normalize_control_category` maps the known legacy
 *      free-text values (the old create-modal list) to themes. Framework-seed
 *      granular domains ("Access control", SOC 2 TSC names) are intentionally
 *      LEFT ALONE — the list/browse display derives their grouping via
 *      `categorizeControl`, and the preserve-as-option behaviour keeps them
 *      editable without loss.
 */
export const CONTROL_CATEGORY_THEMES = [
    'ORGANIZATIONAL',
    'PEOPLE',
    'PHYSICAL',
    'TECHNOLOGICAL',
] as const;

export type ControlCategoryTheme = (typeof CONTROL_CATEGORY_THEMES)[number];

/** True when `v` is one of the four canonical ISO 27002 themes. */
export function isControlCategoryTheme(v: string | null | undefined): v is ControlCategoryTheme {
    return !!v && (CONTROL_CATEGORY_THEMES as readonly string[]).includes(v);
}

/**
 * Legacy free-text category (the retired create-modal list) → canonical theme.
 * The single source of truth for the normalize migration. Keyed on the EXACT
 * strings the old UI wrote (case-sensitive) so framework-seed granular domains
 * — e.g. "Access control" (lower-c) — are not swept up. "Other" has no
 * meaningful theme and is normalized to NULL by the migration.
 */
export const LEGACY_FREE_TEXT_TO_THEME: Readonly<Record<string, ControlCategoryTheme>> = {
    'Access Control': 'TECHNOLOGICAL',
    'Encryption': 'TECHNOLOGICAL',
    'Network Security': 'TECHNOLOGICAL',
    'Physical Security': 'PHYSICAL',
    'HR Security': 'PEOPLE',
    'Operations': 'TECHNOLOGICAL',
    'Compliance': 'ORGANIZATIONAL',
    'Incident Management': 'ORGANIZATIONAL',
    'Business Continuity': 'ORGANIZATIONAL',
};

export interface CategoryOption {
    value: string;
    label: string;
}

/**
 * Build the category combobox options for an editing surface: the four themes
 * (labelled via `labelFor`), plus — when the control's current value is a
 * non-theme legacy/granular/custom string — that value preserved as its own
 * option so it displays honestly and round-trips instead of reading as "None".
 */
export function buildCategoryOptions(
    currentValue: string | null | undefined,
    labelFor: (theme: ControlCategoryTheme) => string,
): CategoryOption[] {
    const options: CategoryOption[] = CONTROL_CATEGORY_THEMES.map((theme) => ({
        value: theme,
        label: labelFor(theme),
    }));
    if (currentValue && !isControlCategoryTheme(currentValue)) {
        options.push({ value: currentValue, label: currentValue });
    }
    return options;
}
