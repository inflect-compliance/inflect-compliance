/**
 * Filter configuration for the Device inventory (PR-5). A static platform enum
 * filter applied client-side to the SSR rows.
 */
import { createTypedFilterDefs, optionsFromEnum } from '@/components/ui/filter/filter-definitions';
// FilterDefInput.icon is typed LucideIcon; allowlisted like every *filter-defs.ts.
import { Laptop } from 'lucide-react';

type T = (key: string, values?: Record<string, unknown>) => string;
type TGroup = (key: string) => string;

const PLATFORM_KEYS = ['MACOS', 'WINDOWS', 'LINUX'] as const;

function platformLabels(t: T): Record<string, string> {
    return Object.fromEntries(PLATFORM_KEYS.map((k) => [k, t(`filterEnums.platform.${k}`)]));
}

function deviceFilterDefsInput(t: T, tGroup: TGroup) {
    return {
        platform: {
            label: t('filters.platform'),
            description: t('filters.platformDesc'),
            group: tGroup('attributes'),
            icon: Laptop,
            options: optionsFromEnum(platformLabels(t)),
            multiple: true,
            resetBehavior: 'clearable',
        },
    } as const;
}

export const DEVICE_FILTER_KEYS = ['platform'] as const;

export function buildDeviceFilterDefs(t: T, tGroup: TGroup) {
    return createTypedFilterDefs()(deviceFilterDefsInput(t, tGroup));
}

export function buildDeviceFilters(t: T, tGroup: TGroup) {
    return buildDeviceFilterDefs(t, tGroup).filters;
}
