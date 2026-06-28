/**
 * Incidents list page filter configuration (NIS2 Article 23).
 *
 * Filtering is applied CLIENT-SIDE in `IncidentsClient` (the incidents
 * API returns the bounded per-tenant list; there's no server filter
 * param yet), so these defs drive the toolbar UI + the in-memory
 * predicate. `q` is the separate search slot owned by
 * `useFilterContext` (matches reference + title).
 */
import { CircleDot, ShieldAlert, Flag } from 'lucide-react';
import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';

export const SEVERITY_LABELS = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
} as const;

export const PHASE_LABELS = {
    DETECTION: 'Detection',
    CLASSIFICATION: 'Classification',
    EARLY_WARNING: 'Early warning',
    CONTAINMENT: 'Containment',
    INVESTIGATION: 'Investigation',
    DETAILED_REPORT: 'Detailed report',
    RECOVERY: 'Recovery',
    CLOSED: 'Closed',
} as const;

export const INCIDENT_TYPE_LABELS = {
    RANSOMWARE: 'Ransomware',
    DATA_BREACH: 'Data breach',
    DDOS: 'DDoS',
    UNAUTHORIZED_ACCESS: 'Unauthorized access',
    OTHER: 'Other',
} as const;

export const REPORTABLE_LABELS = {
    yes: 'Reportable',
    no: 'Not reportable',
} as const;

const STATIC_DEFS = {
    severity: {
        label: 'Severity',
        labelPlural: 'Severities',
        description: 'Impact level of the incident.',
        group: 'Attributes',
        icon: ShieldAlert,
        options: optionsFromEnum(SEVERITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    phase: {
        label: 'Phase',
        labelPlural: 'Phases',
        description: 'Stage in the seven-phase response flow.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(PHASE_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    reportable: {
        label: 'Reportable',
        description: 'Whether NIS2 Article 23 notification is required.',
        group: 'Attributes',
        icon: Flag,
        options: optionsFromEnum(REPORTABLE_LABELS),
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const incidentFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const INCIDENT_FILTER_KEYS = incidentFilterDefs.filterKeys;
