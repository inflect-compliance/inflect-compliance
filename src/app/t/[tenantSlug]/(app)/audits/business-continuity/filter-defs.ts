/**
 * Filter configuration for the Business Continuity (BIA) register (Epic 53).
 * A static criticality enum filter, applied client-side to the SSR rows —
 * mirrors the sibling Vulnerabilities / Security Testing pages.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
// FilterDefInput.icon is typed `LucideIcon`; a new filter-defs file has no
// Nucleo option until the filter platform migrates. Allowlisted in
// tests/guards/no-lucide.test.ts (same precedent as every other *filter-defs.ts).
import { ShieldAlert } from 'lucide-react';

export const BIA_CRITICALITY_LABELS = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
} as const;

const STATIC_DEFS = {
    criticality: {
        label: 'Criticality',
        description: 'Business criticality of the analysed process.',
        group: 'Attributes',
        icon: ShieldAlert,
        options: optionsFromEnum(BIA_CRITICALITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} as const;

export const BIA_FILTER_KEYS = ['criticality'] as const;

export const biaFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

export function buildBiaFilters() {
    return biaFilterDefs.filters;
}
