/**
 * Filter configuration for the Vulnerabilities list page (Epic 53).
 *
 *   status   → AssetVulnerability.status (OPEN | MITIGATING | … )
 *   severity → the matched CVE's CVSS severity (CRITICAL | HIGH | MEDIUM | LOW)
 *
 * Both are static enum filters (no row-derived options), applied client-side
 * to the SSR-fetched rows.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
import { CircleDot, ShieldAlert } from 'lucide-react';

export const VULN_STATUS_LABELS = {
    OPEN: 'Open',
    MITIGATING: 'Mitigating',
    MITIGATED: 'Mitigated',
    ACCEPTED: 'Accepted',
    FALSE_POSITIVE: 'False positive',
} as const;

export const VULN_SEVERITY_LABELS = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Remediation status of the vulnerability.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(VULN_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    severity: {
        label: 'Severity',
        description: 'CVSS base severity of the matched CVE.',
        group: 'Attributes',
        icon: ShieldAlert,
        options: optionsFromEnum(VULN_SEVERITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} as const;

export const VULN_FILTER_KEYS = ['status', 'severity'] as const;

export const vulnFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

export function buildVulnFilters() {
    return vulnFilterDefs.filters;
}
