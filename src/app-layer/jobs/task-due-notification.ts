/**
 * Task-due notification job (the steady-state cron).
 *
 * Once a day at 08:00 UTC, scan every active task whose `dueAt`
 * lands on one of three reminder windows — one week out, one day
 * out, or the due day itself — and write an in-app `Notification`
 * (type `TASK_DUE`) to the task's assignee so the deadline surfaces
 * in the notification bell.
 *
 * The window math + the per-task notification writer live in
 * `@/app-layer/notifications/task-due` — shared with the event-driven
 * usecase path. This file owns only the scan loop. See that module
 * for the reminder-window spec and the dedupeKey idempotency
 * contract.
 *
 * Two scope modes (mirrors `access-review-reminder` / `policyReviewReminder`):
 *   - tenantId provided → scan that single tenant.
 *   - tenantId omitted  → scan every tenant (system-wide nightly cron).
 *
 * In-app only. The email deadline digest (`notification-dispatch`)
 * already covers these deadlines over email; this job fills the gap
 * that nothing was writing to the notification bell.
 *
 * Bypassed when:
 *   - Task is RESOLVED / CLOSED / CANCELED or soft-deleted (query filter).
 *   - Task has no assignee — no recipient (query filter).
 *   - `dueAt` is not on a {7,1,0}-day window (skipped silently).
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/observability/logger';
import { TERMINAL_WORK_ITEM_STATUSES } from '../domain/work-item-status';
import {
    MS_PER_DAY,
    startOfUtcDay,
    createTaskDueNotification,
    type TaskDueWindow,
} from '../notifications/task-due';

// Re-export the shared surface so existing importers (tests, the
// executor registry) keep resolving it from this module.
export {
    MS_PER_DAY,
    daysUntilDue,
    classifyDueWindow,
    buildTaskDueDedupeKey,
    createTaskDueNotification,
    TASK_DUE_WINDOWS,
} from '../notifications/task-due';
export type {
    TaskDueWindow,
    TaskDueTarget,
    TaskDueNotificationOutcome,
} from '../notifications/task-due';

export interface TaskDueNotificationOptions {
    /** When provided, scope ALL queries to this single tenant. */
    tenantId?: string;
    /** Override the "now" anchor — test-only seam. */
    now?: Date;
}

export interface TaskDueNotificationResult {
    /** Active, assigned tasks pulled inside the 0-7 day horizon. */
    scanned: number;
    /** Notifications successfully inserted. */
    created: number;
    /** Inserts whose dedupeKey already existed (same UTC day). */
    skippedDuplicate: number;
    /** Created notifications, broken down by reminder window. */
    byWindow: Record<TaskDueWindow, number>;
}

/**
 * Scan + notify. Public seam — `executor-registry` calls this with
 * the global Prisma client; tests construct their own and call directly.
 */
export async function processTaskDueNotifications(
    db: PrismaClient,
    options: TaskDueNotificationOptions = {},
): Promise<TaskDueNotificationResult> {
    const now = options.now ?? new Date();
    const { tenantId } = options;
    const scope = tenantId ? 'tenant-scoped' : 'system-wide';

    logger.info('task-due notification scan starting', {
        component: 'task-due-notification',
        scope,
        ...(tenantId ? { tenantId } : {}),
    });

    // Horizon: UTC-midnight today → end of the 7th day out. Days 2-6
    // are pulled too but classify to `null` and are ignored — one
    // bounded range query is cheaper than three OR'd ranges.
    const horizonStart = startOfUtcDay(now);
    const horizonEnd = new Date(horizonStart.getTime() + 8 * MS_PER_DAY);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
        deletedAt: null,
        assigneeUserId: { not: null },
        status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
        dueAt: { gte: horizonStart, lt: horizonEnd },
    };
    if (tenantId) where.tenantId = tenantId;

    const tasks = await db.task.findMany({
        where,
        select: {
            id: true,
            tenantId: true,
            title: true,
            key: true,
            dueAt: true,
            assigneeUserId: true,
            tenant: { select: { slug: true } },
        },
        orderBy: { dueAt: 'asc' },
    });

    const byWindow: Record<TaskDueWindow, number> = { week: 0, day: 0, today: 0 };
    let created = 0;
    let skippedDuplicate = 0;

    for (const task of tasks) {
        // The query guarantees these are non-null, but TS still sees
        // them nullable through the `select` projection.
        if (!task.dueAt || !task.assigneeUserId) continue;

        const { status, window } = await createTaskDueNotification(
            db,
            {
                id: task.id,
                tenantId: task.tenantId,
                tenantSlug: task.tenant.slug,
                title: task.title,
                key: task.key,
                dueAt: task.dueAt,
                assigneeUserId: task.assigneeUserId,
            },
            now,
        );
        if (status === 'created' && window) {
            created++;
            byWindow[window]++;
        } else if (status === 'duplicate') {
            skippedDuplicate++;
        }
    }

    const result: TaskDueNotificationResult = {
        scanned: tasks.length,
        created,
        skippedDuplicate,
        byWindow,
    };

    logger.info('task-due notification scan complete', {
        component: 'task-due-notification',
        scope,
        ...result,
        ...(tenantId ? { tenantId } : {}),
    });

    return result;
}
