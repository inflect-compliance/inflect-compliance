/**
 * Filter configuration for the EU AI Act AI-System Registry. A static
 * risk-tier enum filter, applied client-side to the SSR rows — mirrors the
 * sibling Business Continuity / Vulnerabilities pages.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
// FilterDefInput.icon is typed `LucideIcon`; a new filter-defs file has no
// Nucleo option until the filter platform migrates. Allowlisted in
// tests/guards/no-lucide.test.ts (same precedent as every other *filter-defs.ts).
import { ShieldAlert } from 'lucide-react';

export const AI_RISK_TIER_LABELS = {
    PROHIBITED: 'Prohibited',
    HIGH: 'High',
    LIMITED: 'Limited',
    MINIMAL: 'Minimal',
} as const;

const STATIC_DEFS = {
    riskTier: {
        label: 'Risk tier',
        description: 'EU AI Act risk classification of the system.',
        group: 'Attributes',
        icon: ShieldAlert,
        options: optionsFromEnum(AI_RISK_TIER_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} as const;

export const AI_SYSTEM_FILTER_KEYS = ['riskTier'] as const;

export const aiSystemFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

export function buildAiSystemFilters() {
    return aiSystemFilterDefs.filters;
}
