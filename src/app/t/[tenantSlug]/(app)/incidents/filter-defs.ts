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

/** Surface-namespace resolver (`useTranslations('incidents')`). */
type T = (key: string, values?: Record<string, unknown>) => string;
/** Shared filter-group resolver (`useTranslations('common.filterGroups')`). */
type TGroup = (key: string) => string;

// Enum key unions (the labels moved to next-intl, but the VALUE sets are
// still the stable enum members — kept as types for the row/meta typings).
export type IncidentSeverityKey = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentPhaseKey =
    | 'DETECTION'
    | 'CLASSIFICATION'
    | 'EARLY_WARNING'
    | 'CONTAINMENT'
    | 'INVESTIGATION'
    | 'DETAILED_REPORT'
    | 'RECOVERY'
    | 'CLOSED';
export type IncidentTypeKey =
    | 'RANSOMWARE'
    | 'DATA_BREACH'
    | 'DDOS'
    | 'UNAUTHORIZED_ACCESS'
    | 'OTHER';

export function buildSeverityLabels(t: T): Record<string, string> {
    return {
        LOW: t('filterEnums.severity.low'),
        MEDIUM: t('filterEnums.severity.medium'),
        HIGH: t('filterEnums.severity.high'),
        CRITICAL: t('filterEnums.severity.critical'),
    };
}

export function buildPhaseLabels(t: T): Record<string, string> {
    return {
        DETECTION: t('filterEnums.phase.detection'),
        CLASSIFICATION: t('filterEnums.phase.classification'),
        EARLY_WARNING: t('filterEnums.phase.earlyWarning'),
        CONTAINMENT: t('filterEnums.phase.containment'),
        INVESTIGATION: t('filterEnums.phase.investigation'),
        DETAILED_REPORT: t('filterEnums.phase.detailedReport'),
        RECOVERY: t('filterEnums.phase.recovery'),
        CLOSED: t('filterEnums.phase.closed'),
    };
}

export function buildIncidentTypeLabels(t: T): Record<string, string> {
    return {
        RANSOMWARE: t('filterEnums.type.ransomware'),
        DATA_BREACH: t('filterEnums.type.dataBreach'),
        DDOS: t('filterEnums.type.ddos'),
        UNAUTHORIZED_ACCESS: t('filterEnums.type.unauthorizedAccess'),
        OTHER: t('filterEnums.type.other'),
    };
}

function reportableLabels(t: T): Record<string, string> {
    return {
        yes: t('filterEnums.reportable.yes'),
        no: t('filterEnums.reportable.no'),
    };
}

function incidentFilterDefsInput(t: T, tGroup: TGroup) {
    return {
        severity: {
            label: t('filters.severity'),
            labelPlural: t('filters.severityPlural'),
            description: t('filters.severityDesc'),
            group: tGroup('attributes'),
            icon: ShieldAlert,
            options: optionsFromEnum(buildSeverityLabels(t)),
            multiple: true,
            resetBehavior: 'clearable',
        },
        phase: {
            label: t('filters.phase'),
            labelPlural: t('filters.phasePlural'),
            description: t('filters.phaseDesc'),
            group: tGroup('attributes'),
            icon: CircleDot,
            options: optionsFromEnum(buildPhaseLabels(t)),
            multiple: true,
            resetBehavior: 'clearable',
        },
        reportable: {
            label: t('filters.reportable'),
            description: t('filters.reportableDesc'),
            group: tGroup('attributes'),
            icon: Flag,
            options: optionsFromEnum(reportableLabels(t)),
            resetBehavior: 'clearable',
        },
    } satisfies Record<string, FilterDefInput>;
}

/** Build the localized incident filter defs. `t` = `useTranslations('incidents')`,
 *  `tGroup` = `useTranslations('common.filterGroups')`. Memoize per render. */
export function buildIncidentFilterDefs(t: T, tGroup: TGroup) {
    return createTypedFilterDefs()(incidentFilterDefsInput(t, tGroup));
}

const IDENTITY: T = (k) => k;
const IDENTITY_GROUP: TGroup = (k) => k;
export const INCIDENT_FILTER_KEYS = buildIncidentFilterDefs(IDENTITY, IDENTITY_GROUP).filterKeys;
