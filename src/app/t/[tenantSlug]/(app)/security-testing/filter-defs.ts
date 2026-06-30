/**
 * Filter configuration for the Security Testing (scanner findings) list
 * page (Epic 53).
 *
 *   source   → the scanner the finding came from (SEMGREP | TRIVY | …)
 *   severity → mapped finding severity (CRITICAL | HIGH | MEDIUM | LOW)
 *   status   → triage status (OPEN | TRIAGED | FIXED | … )
 *
 * All static enum filters (no row-derived options), applied client-side to
 * the SSR-fetched rows — mirrors the sibling Vulnerabilities page.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
// FilterDefInput.icon is typed `LucideIcon` (the filter platform hasn't
// migrated to Nucleo), so filter-defs use lucide-react — same as every other
// *filter-defs.ts. This file is allowlisted in tests/guards/no-lucide.test.ts.
import { CircleDot, ShieldAlert, ScanLine } from 'lucide-react';

export const SCANNER_SOURCE_LABELS = {
    SEMGREP: 'Semgrep',
    TRIVY: 'Trivy',
    ZAP: 'ZAP',
    GITLEAKS: 'gitleaks',
    CHECKOV: 'Checkov',
    CODEQL: 'CodeQL',
    OTHER: 'Other',
} as const;

export const SCANNER_SEVERITY_LABELS = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
} as const;

export const SCANNER_STATUS_LABELS = {
    OPEN: 'Open',
    TRIAGED: 'Triaged',
    FIXED: 'Fixed',
    FALSE_POSITIVE: 'False positive',
    ACCEPTED: 'Accepted',
} as const;

const STATIC_DEFS = {
    source: {
        label: 'Source',
        description: 'The scanner that produced the finding.',
        group: 'Attributes',
        icon: ScanLine,
        options: optionsFromEnum(SCANNER_SOURCE_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    severity: {
        label: 'Severity',
        description: 'Mapped severity of the finding.',
        group: 'Attributes',
        icon: ShieldAlert,
        options: optionsFromEnum(SCANNER_SEVERITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    status: {
        label: 'Status',
        description: 'Triage status of the finding.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(SCANNER_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} as const;

export const SCANNER_FILTER_KEYS = ['source', 'severity', 'status'] as const;

export const scannerFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

export function buildScannerFilters() {
    return scannerFilterDefs.filters;
}
