/**
 * PR-E — canonical allowlist of UPDATE_STATUS targets.
 *
 * Single source of truth shared by the server executor (action-executor.ts,
 * which enforces it) and the rule-builder UI (RuleBuilderModal, which offers
 * entity + status DROPDOWNS instead of free-text so a user can't type a value
 * the executor would silently reject). Client-safe: plain data, no server
 * imports.
 *
 * Each entry: the entity type, the status column it writes, and the exact set
 * of legal values. `Issue` is intentionally absent — the executor does not
 * support it (its status model differs), so it must not be offered.
 */
export interface StatusTargetSpec {
    field: string;
    values: readonly string[];
}

export const UPDATE_STATUS_TARGETS: Record<string, StatusTargetSpec> = {
    Risk: {
        field: 'status',
        values: ['OPEN', 'MITIGATING', 'MITIGATED', 'ACCEPTED', 'CLOSED'],
    },
    Task: {
        field: 'status',
        values: [
            'OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED',
        ],
    },
    Control: {
        field: 'status',
        values: [
            'NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'IMPLEMENTING',
            'IMPLEMENTED', 'NEEDS_REVIEW', 'NOT_APPLICABLE',
        ],
    },
};

/** The entity types UPDATE_STATUS can target. */
export const UPDATE_STATUS_ENTITY_TYPES = Object.keys(
    UPDATE_STATUS_TARGETS,
) as ReadonlyArray<keyof typeof UPDATE_STATUS_TARGETS>;
