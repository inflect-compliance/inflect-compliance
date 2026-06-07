/**
 * Trigger filter evaluation (DSL v2 — Epic 4).
 *
 * `AutomationRule.triggerFilterJson` is either:
 *   - a recursive `FilterGroup` (new): `{ logic, conditions[] }` with
 *     AND/OR grouping and the `eq/neq/in/not_in/gt/lt/contains` operators;
 *   - a legacy flat equality map (`{ severity: "CRITICAL" }`).
 *
 * The dispatcher calls `matchesFilter(event, rule.triggerFilterJson)` before
 * firing. Guiding rules (unchanged from v1):
 *   - `null | undefined` filter ⇒ match every event of this type.
 *   - Conditions read ONLY the event's `data` payload (metadata is contract,
 *     not rule-addressable).
 *   - Unknown fields fail closed: a condition on a field absent from the
 *     payload does not match.
 *
 * Dual-shape support means pre-Epic-4 rows keep firing without a migration.
 */

import type { AutomationDomainEvent } from './event-contracts';
import type {
    AutomationTriggerFilter,
    FilterCondition,
    FilterGroup,
    LegacyTriggerFilter,
} from './types';
import { isFilterGroup } from './types';

function evalCondition(
    cond: FilterCondition,
    data: Record<string, unknown>,
): boolean {
    const actual = data[cond.field];
    // Unknown field → fail closed for every operator, so a typo'd field
    // never silently matches (keeps the v1 contract).
    if (actual === undefined) return false;

    const { operator, value } = cond;
    switch (operator) {
        case 'eq':
            return actual === value;
        case 'neq':
            return actual !== value;
        case 'in':
            return Array.isArray(value) && value.includes(String(actual));
        case 'not_in':
            return Array.isArray(value) && !value.includes(String(actual));
        case 'gt':
            return typeof actual === 'number' && Number(actual) > Number(value);
        case 'lt':
            return typeof actual === 'number' && Number(actual) < Number(value);
        case 'contains':
            return String(actual).includes(String(value));
        default:
            return false;
    }
}

function evalGroup(group: FilterGroup, data: Record<string, unknown>): boolean {
    // Empty group ⇒ match (no constraints) for both AND and OR, so an empty
    // builder group never blocks a fire.
    if (group.conditions.length === 0) return true;
    const results = group.conditions.map((c) =>
        isFilterGroup(c) ? evalGroup(c, data) : evalCondition(c as FilterCondition, data),
    );
    return group.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

function evalLegacy(
    filter: LegacyTriggerFilter,
    data: Record<string, unknown>,
): boolean {
    for (const [key, expected] of Object.entries(filter)) {
        const actual = data[key];
        if (actual === undefined) return false;
        if (actual !== expected) return false;
    }
    return true;
}

/**
 * Return true if the event should fire against a rule with this filter.
 */
export function matchesFilter(
    event: AutomationDomainEvent,
    filter: AutomationTriggerFilter | null | undefined,
): boolean {
    if (!filter) return true;
    const data = event.data as Record<string, unknown>;
    return isFilterGroup(filter)
        ? evalGroup(filter, data)
        : evalLegacy(filter as LegacyTriggerFilter, data);
}
