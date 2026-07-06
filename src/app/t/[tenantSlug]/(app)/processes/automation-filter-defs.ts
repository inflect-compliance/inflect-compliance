/**
 * Automation Rules tab — filter configuration (Automation Epic 1).
 *
 * Keys: status, triggerEvent, actionType. Filtering is applied in-memory
 * over the fetched rule list (rule counts are small — tens, not
 * thousands), so multi-select values never need to round-trip as query
 * params. The shared filter-defs machinery still drives the toolbar UI.
 */
import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import { CircleDot, Zap, Wrench } from 'lucide-react';
// Import the leaf events module, NOT the @/app-layer/automation barrel: the
// barrel re-exports automation-bus → observability → OpenTelemetry, which
// drags the Node-only `async_hooks` into this client-bundled file and breaks
// the Next build. `events.ts` is pure constants.
import { AUTOMATION_EVENT_NAMES } from '@/app-layer/automation/events';

type Resolver = (key: string) => string;
const IDENTITY: Resolver = (k) => k;

export type RuleStatusKey = 'DRAFT' | 'ENABLED' | 'DISABLED' | 'ARCHIVED';
export type RuleActionKey = 'NOTIFY_USER' | 'CREATE_TASK' | 'UPDATE_STATUS' | 'WEBHOOK';

export const buildRuleStatusLabels = (t: Resolver): Record<RuleStatusKey, string> => ({
    DRAFT: t('ruleStatusLabels.DRAFT'),
    ENABLED: t('ruleStatusLabels.ENABLED'),
    DISABLED: t('ruleStatusLabels.DISABLED'),
    ARCHIVED: t('ruleStatusLabels.ARCHIVED'),
});

export const buildRuleActionLabels = (t: Resolver): Record<RuleActionKey, string> => ({
    NOTIFY_USER: t('ruleActionLabels.NOTIFY_USER'),
    CREATE_TASK: t('ruleActionLabels.CREATE_TASK'),
    UPDATE_STATUS: t('ruleActionLabels.UPDATE_STATUS'),
    WEBHOOK: t('ruleActionLabels.WEBHOOK'),
});

/** Trigger-event options derived from the canonical event catalog. */
const TRIGGER_OPTIONS = AUTOMATION_EVENT_NAMES.map((name) => ({
    value: name,
    label: name
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
}));

const ruleFilterDefsInput = (t: Resolver, tGroup: Resolver) => ({
    status: {
        label: t('filters.status'),
        description: t('filters.statusDesc'),
        group: tGroup('attributes'),
        icon: CircleDot,
        options: optionsFromEnum(buildRuleStatusLabels(t)),
        multiple: true,
        resetBehavior: 'clearable',
    },
    triggerEvent: {
        label: t('filters.trigger'),
        description: t('filters.triggerDesc'),
        group: tGroup('attributes'),
        icon: Zap,
        options: TRIGGER_OPTIONS,
        multiple: true,
        resetBehavior: 'clearable',
    },
    actionType: {
        label: t('filters.action'),
        description: t('filters.actionDesc'),
        group: tGroup('attributes'),
        icon: Wrench,
        options: optionsFromEnum(buildRuleActionLabels(t)),
        multiple: true,
        resetBehavior: 'clearable',
    },
}) satisfies Record<string, FilterDefInput>;

export const buildRuleFilterDefs = (t: Resolver, tGroup: Resolver) =>
    createTypedFilterDefs()(ruleFilterDefsInput(t, tGroup));

export const RULE_FILTER_KEYS = buildRuleFilterDefs(IDENTITY, IDENTITY).filterKeys;

export function buildRuleFilters(t: Resolver, tGroup: Resolver) {
    return buildRuleFilterDefs(t, tGroup).filters;
}
