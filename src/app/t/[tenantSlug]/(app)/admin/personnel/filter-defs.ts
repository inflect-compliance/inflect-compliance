/**
 * Filter configuration for the Personnel roster (PR-4). A static employment-
 * status enum filter applied client-side to the SSR rows.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
// FilterDefInput.icon is typed LucideIcon; allowlisted like every *filter-defs.ts.
import { Users } from 'lucide-react';

type T = (key: string, values?: Record<string, unknown>) => string;
type TGroup = (key: string) => string;

const STATUS_KEYS = ['ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'TERMINATED', 'LEAVE'] as const;

function statusLabels(t: T): Record<string, string> {
    return Object.fromEntries(STATUS_KEYS.map((k) => [k, t(`filterEnums.status.${k}`)]));
}

function personnelFilterDefsInput(t: T, tGroup: TGroup) {
    return {
        status: {
            label: t('filters.status'),
            description: t('filters.statusDesc'),
            group: tGroup('attributes'),
            icon: Users,
            options: optionsFromEnum(statusLabels(t)),
            multiple: true,
            resetBehavior: 'clearable',
        },
    } as const;
}

export const PERSONNEL_FILTER_KEYS = ['status'] as const;

export function buildPersonnelFilterDefs(t: T, tGroup: TGroup) {
    return createTypedFilterDefs()(personnelFilterDefsInput(t, tGroup));
}

export function buildPersonnelFilters(t: T, tGroup: TGroup) {
    return buildPersonnelFilterDefs(t, tGroup).filters;
}
