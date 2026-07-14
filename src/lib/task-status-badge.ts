/**
 * Tasks roadmap TP-1 — the single source of truth for how a task
 * (`WorkItemStatus`) renders as a `<StatusBadge>`.
 *
 * Before this module, status → colour/label was duplicated and
 * *divergent* across every task renderer: some used `OPEN: 'warning'`,
 * others `OPEN: 'neutral'`; some carried a phantom `DONE` variant or the
 * two-L `CANCELLED` spelling that the `WorkItemStatus` enum never had.
 * This map is now the ONE place that decision lives — every task
 * renderer imports it, so a tone change happens once.
 *
 * Client-safe by construction: it imports only the `StatusBadgeVariant`
 * *type* and the plain-constant `WorkItemStatusValue` union, so it can be
 * pulled into client components without dragging server-only code.
 *
 * The canonical enum is `WorkItemStatus`
 * (prisma/schema/enums.prisma): OPEN, TRIAGED, IN_PROGRESS, BLOCKED,
 * RESOLVED, CLOSED, CANCELED — exactly seven values, spelling CANCELED
 * (one L), and there is NO "DONE".
 */

import type { StatusBadgeVariant } from '@/components/ui/status-badge';
import type { WorkItemStatusValue } from '@/app-layer/domain/work-item-status';

export interface TaskStatusBadgeSpec {
    /** Platform `<StatusBadge>` tone. */
    variant: StatusBadgeVariant;
    /**
     * next-intl message key, RELATIVE to the `tasks` namespace
     * (`useTranslations('tasks')`). Resolve via `taskStatusLabel`.
     */
    labelKey: string;
}

/**
 * The one status → badge map. Keyed by exactly the seven
 * `WorkItemStatus` values. `OPEN` is neutral everywhere (the single
 * consistent open tone); `BLOCKED` is the only error tone.
 */
export const TASK_STATUS_BADGE: Record<WorkItemStatusValue, TaskStatusBadgeSpec> = {
    OPEN: { variant: 'neutral', labelKey: 'statusLabels.OPEN' },
    TRIAGED: { variant: 'info', labelKey: 'statusLabels.TRIAGED' },
    IN_PROGRESS: { variant: 'info', labelKey: 'statusLabels.IN_PROGRESS' },
    BLOCKED: { variant: 'error', labelKey: 'statusLabels.BLOCKED' },
    RESOLVED: { variant: 'success', labelKey: 'statusLabels.RESOLVED' },
    CLOSED: { variant: 'neutral', labelKey: 'statusLabels.CLOSED' },
    CANCELED: { variant: 'neutral', labelKey: 'statusLabels.CANCELED' },
};

/**
 * Resolve a (possibly unknown / legacy) status string to a badge tone.
 * Unmapped values fall back to `neutral` — the caller never has to
 * spell the default.
 */
export function taskStatusVariant(status: string): StatusBadgeVariant {
    return TASK_STATUS_BADGE[status as WorkItemStatusValue]?.variant ?? 'neutral';
}

/**
 * Resolve a status string to its localized label. `t` must be a
 * `tasks`-namespaced translator (`useTranslations('tasks')` /
 * `getTranslations('tasks')`). Unmapped values echo the raw status.
 */
export function taskStatusLabel(
    status: string,
    t: (key: string) => string,
): string {
    const spec = TASK_STATUS_BADGE[status as WorkItemStatusValue];
    return spec ? t(spec.labelKey) : status;
}
