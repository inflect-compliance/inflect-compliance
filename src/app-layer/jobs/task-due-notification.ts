/**
 * Task-due notification job.
 *
 * Once a day at 08:00 UTC, scan every active task whose `dueAt`
 * lands on one of three reminder windows — one week out, one day
 * out, or the due day itself — and write an in-app `Notification`
 * (type `TASK_DUE`) to the task's assignee so the deadline surfaces
 * in the notification bell.
 *
 * Two scope modes (mirrors `access-review-reminder` / `policyReviewReminder`):
 *   - tenantId provided → scan that single tenant.
 *   - tenantId omitted  → scan every tenant (system-wide nightly cron).
 *
 * Reminder windows:
 *   A task is notified when the integer count of UTC calendar days
 *   from "now" to `dueAt` is exactly 7, 1, or 0. Days 2-6 produce
 *   nothing — the three discrete touchpoints are the spec. Classifying
 *   by calendar day (not millisecond math) means a task due "tomorrow
 *   at 23:00" still reads as the one-day window when the job fires at
 *   08:00.
 *
 * Deduplication contract:
 *   `Notification.dedupeKey` is unique. The key is
 *   `{tenantId}:TASK_DUE:{window}:{taskId}:{userId}:{YYYY-MM-DD}`
 *   where the date is the UTC run-day. Re-running the job within the
 *   same UTC day is idempotent — the second insert trips P2002 and is
 *   counted as `skippedDuplicate`. A task matches at most one window
 *   per run, so over its life a task yields at most three
 *   notifications (7d → 1d → 0d).
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The three reminder touchpoints. */
export type TaskDueWindow = 'week' | 'day' | 'today';

interface WindowCopy {
    /** Integer UTC calendar days from now to `dueAt` that triggers it. */
    days: number;
    /** Bell title line. */
    title: string;
    /** Sentence fragment — "<task label> <phrase>." */
    phrase: string;
}

/**
 * Window definitions, ordered furthest-out → due-day. The `days`
 * value is the single source of truth for both classification and
 * the human copy.
 */
export const TASK_DUE_WINDOWS: Record<TaskDueWindow, WindowCopy> = {
    week: { days: 7, title: 'Task due in one week', phrase: 'is due in one week' },
    day: { days: 1, title: 'Task due tomorrow', phrase: 'is due tomorrow' },
    today: { days: 0, title: 'Task due today', phrase: 'is due today' },
};

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
    /** Inserts that tripped the dedupeKey unique index (same UTC day). */
    skippedDuplicate: number;
    /** Created notifications, broken down by reminder window. */
    byWindow: Record<TaskDueWindow, number>;
}

/** UTC midnight of the given instant. */
function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `YYYY-MM-DD` of the given instant, in UTC. */
function utcDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Integer count of UTC calendar days from `now` to `dueAt`.
 * 0 = due today, 1 = due tomorrow, negative = overdue. Time-of-day
 * is discarded on both sides. Pure function — suitable for
 * unit-testing the boundary math.
 */
export function daysUntilDue(dueAt: Date, now: Date = new Date()): number {
    return Math.round(
        (startOfUtcDay(dueAt).getTime() - startOfUtcDay(now).getTime()) / MS_PER_DAY,
    );
}

/**
 * Map a due date to its reminder window, or `null` when the date is
 * not on one of the three touchpoints. Pure function.
 */
export function classifyDueWindow(
    dueAt: Date,
    now: Date = new Date(),
): TaskDueWindow | null {
    const days = daysUntilDue(dueAt, now);
    for (const key of Object.keys(TASK_DUE_WINDOWS) as TaskDueWindow[]) {
        if (TASK_DUE_WINDOWS[key].days === days) return key;
    }
    return null;
}

/** dedupeKey shape — see the module docstring's dedup contract. */
export function buildTaskDueDedupeKey(
    tenantId: string,
    window: TaskDueWindow,
    taskId: string,
    userId: string,
    now: Date,
): string {
    return `${tenantId}:TASK_DUE:${window}:${taskId}:${userId}:${utcDayKey(now)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002' || error?.message?.includes('Unique constraint');
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

        const window = classifyDueWindow(task.dueAt, now);
        if (!window) continue;

        const copy = TASK_DUE_WINDOWS[window];
        const label = task.key ? `${task.key} "${task.title}"` : `"${task.title}"`;

        try {
            await db.notification.create({
                data: {
                    tenantId: task.tenantId,
                    userId: task.assigneeUserId,
                    type: 'TASK_DUE',
                    title: copy.title,
                    message: `${label} ${copy.phrase}.`,
                    linkUrl: `/t/${task.tenant.slug}/tasks/${task.id}`,
                    dedupeKey: buildTaskDueDedupeKey(
                        task.tenantId,
                        window,
                        task.id,
                        task.assigneeUserId,
                        now,
                    ),
                },
            });
            created++;
            byWindow[window]++;
        } catch (error: unknown) {
            if (isUniqueConstraintError(error)) {
                // Already notified for this task+user+window this UTC
                // day — idempotent re-run. Not an error.
                skippedDuplicate++;
                continue;
            }
            throw error;
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
