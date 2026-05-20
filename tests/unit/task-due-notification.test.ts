/**
 * Unit tests for the `task-due-notification` job.
 *
 * Covers the pure window-classification math, the scan/notify flow,
 * the three reminder windows (one week / one day / due day), tenant
 * scoping, and the dedupeKey idempotency contract.
 *
 * Prisma is mocked — this is a behavioural unit test, not an
 * integration test. The job's only collaborators are `db.task` and
 * `db.notification`.
 */

import type { PrismaClient } from '@prisma/client';

jest.mock('@/lib/observability/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        fatal: jest.fn(),
        child: jest.fn().mockReturnThis(),
    },
}));

import {
    daysUntilDue,
    classifyDueWindow,
    buildTaskDueDedupeKey,
    processTaskDueNotifications,
    TASK_DUE_WINDOWS,
} from '../../src/app-layer/jobs/task-due-notification';

// ── Fixtures ────────────────────────────────────────────────────────

/** Anchor instant — 08:00 UTC, the cron firing time. */
const NOW = new Date('2026-05-20T08:00:00.000Z');

const DUE_TODAY = new Date('2026-05-20T14:30:00.000Z');
const DUE_TOMORROW = new Date('2026-05-21T03:00:00.000Z');
const DUE_IN_7_DAYS = new Date('2026-05-27T22:00:00.000Z');
const DUE_IN_3_DAYS = new Date('2026-05-23T10:00:00.000Z');

interface TaskRow {
    id: string;
    tenantId: string;
    title: string;
    key: string | null;
    dueAt: Date | null;
    assigneeUserId: string | null;
    tenant: { slug: string };
}

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
    return {
        id: 'task-1',
        tenantId: 'tenant-a',
        title: 'Rotate API keys',
        key: 'TSK-1',
        dueAt: DUE_TODAY,
        assigneeUserId: 'user-1',
        tenant: { slug: 'acme' },
        ...overrides,
    };
}

function makeDb(tasks: TaskRow[]) {
    const findMany = jest.fn().mockResolvedValue(tasks);
    const create = jest.fn().mockResolvedValue({ id: 'notif-1' });
    const db = {
        task: { findMany },
        notification: { create },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as PrismaClient;
    return { db, findMany, create };
}

/** Last `data` payload passed to `notification.create`. */
function lastCreateData(create: jest.Mock): Record<string, unknown> {
    return create.mock.calls[create.mock.calls.length - 1][0].data;
}

// ════════════════════════════════════════════════════════════════════
// 1. daysUntilDue — calendar-day math
// ════════════════════════════════════════════════════════════════════

describe('daysUntilDue', () => {
    test('due later the same UTC day → 0', () => {
        expect(daysUntilDue(DUE_TODAY, NOW)).toBe(0);
    });

    test('due the next UTC day → 1', () => {
        expect(daysUntilDue(DUE_TOMORROW, NOW)).toBe(1);
    });

    test('due seven UTC days out → 7', () => {
        expect(daysUntilDue(DUE_IN_7_DAYS, NOW)).toBe(7);
    });

    test('overdue by one day → -1', () => {
        expect(daysUntilDue(new Date('2026-05-19T23:00:00.000Z'), NOW)).toBe(-1);
    });

    test('time-of-day is discarded — 2h apart but across midnight → 1', () => {
        const lateNow = new Date('2026-05-20T23:00:00.000Z');
        const earlyNextDay = new Date('2026-05-21T01:00:00.000Z');
        expect(daysUntilDue(earlyNextDay, lateNow)).toBe(1);
    });
});

// ════════════════════════════════════════════════════════════════════
// 2. classifyDueWindow — only {0,1,7} map to a window
// ════════════════════════════════════════════════════════════════════

describe('classifyDueWindow', () => {
    test('due today → "today"', () => {
        expect(classifyDueWindow(DUE_TODAY, NOW)).toBe('today');
    });

    test('due tomorrow → "day"', () => {
        expect(classifyDueWindow(DUE_TOMORROW, NOW)).toBe('day');
    });

    test('due in seven days → "week"', () => {
        expect(classifyDueWindow(DUE_IN_7_DAYS, NOW)).toBe('week');
    });

    test.each([2, 3, 4, 5, 6])('due in %i days → null (no touchpoint)', (offset) => {
        const dueAt = new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);
        expect(classifyDueWindow(dueAt, NOW)).toBeNull();
    });

    test('overdue → null', () => {
        expect(classifyDueWindow(new Date('2026-05-19T10:00:00.000Z'), NOW)).toBeNull();
    });

    test('beyond the week window → null', () => {
        expect(classifyDueWindow(new Date('2026-05-28T10:00:00.000Z'), NOW)).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// 3. buildTaskDueDedupeKey — shape contract
// ════════════════════════════════════════════════════════════════════

describe('buildTaskDueDedupeKey', () => {
    test('encodes tenant, type, window, task, user and UTC run-day', () => {
        const key = buildTaskDueDedupeKey('tenant-a', 'today', 'task-9', 'user-3', NOW);
        expect(key).toBe('tenant-a:TASK_DUE:today:task-9:user-3:2026-05-20');
    });

    test('the same task on a different window yields a distinct key', () => {
        const week = buildTaskDueDedupeKey('tenant-a', 'week', 'task-9', 'user-3', NOW);
        const day = buildTaskDueDedupeKey('tenant-a', 'day', 'task-9', 'user-3', NOW);
        expect(week).not.toBe(day);
    });
});

// ════════════════════════════════════════════════════════════════════
// 4. processTaskDueNotifications — scan + notify
// ════════════════════════════════════════════════════════════════════

describe('processTaskDueNotifications — notification creation', () => {
    test('creates a TASK_DUE notification for a task due today', async () => {
        const { db, create } = makeDb([makeTask()]);

        const result = await processTaskDueNotifications(db, {
            tenantId: 'tenant-a',
            now: NOW,
        });

        expect(create).toHaveBeenCalledTimes(1);
        const data = lastCreateData(create);
        expect(data).toMatchObject({
            tenantId: 'tenant-a',
            userId: 'user-1',
            type: 'TASK_DUE',
            title: 'Task due today',
            message: 'TSK-1 "Rotate API keys" is due today.',
            linkUrl: '/t/acme/tasks/task-1',
            dedupeKey: 'tenant-a:TASK_DUE:today:task-1:user-1:2026-05-20',
        });
        expect(result).toEqual({
            scanned: 1,
            created: 1,
            skippedDuplicate: 0,
            byWindow: { week: 0, day: 0, today: 1 },
        });
    });

    test('fires distinct copy for each of the three windows', async () => {
        const { db, create } = makeDb([
            makeTask({ id: 't-today', dueAt: DUE_TODAY }),
            makeTask({ id: 't-tomorrow', dueAt: DUE_TOMORROW }),
            makeTask({ id: 't-week', dueAt: DUE_IN_7_DAYS }),
        ]);

        const result = await processTaskDueNotifications(db, { now: NOW });

        expect(create).toHaveBeenCalledTimes(3);
        const byTitle = create.mock.calls.map((c) => c[0].data.title).sort();
        expect(byTitle).toEqual([
            'Task due in one week',
            'Task due today',
            'Task due tomorrow',
        ]);
        expect(result.byWindow).toEqual({ week: 1, day: 1, today: 1 });
        expect(result.created).toBe(3);
    });

    test('window copy matches the TASK_DUE_WINDOWS table', async () => {
        const { db, create } = makeDb([
            makeTask({ id: 't-tomorrow', key: null, dueAt: DUE_TOMORROW }),
        ]);

        await processTaskDueNotifications(db, { now: NOW });

        const data = lastCreateData(create);
        expect(data.title).toBe(TASK_DUE_WINDOWS.day.title);
        expect(data.message).toBe('"Rotate API keys" is due tomorrow.');
    });

    test('ignores tasks not on a {7,1,0}-day touchpoint', async () => {
        const { db, create } = makeDb([
            makeTask({ id: 't-3days', dueAt: DUE_IN_3_DAYS }),
        ]);

        const result = await processTaskDueNotifications(db, { now: NOW });

        expect(create).not.toHaveBeenCalled();
        expect(result).toEqual({
            scanned: 1,
            created: 0,
            skippedDuplicate: 0,
            byWindow: { week: 0, day: 0, today: 0 },
        });
    });

    test('a task with no key omits the key prefix from the message', async () => {
        const { db, create } = makeDb([makeTask({ key: null })]);

        await processTaskDueNotifications(db, { now: NOW });

        expect(lastCreateData(create).message).toBe('"Rotate API keys" is due today.');
    });

    test('linkUrl is built from the task tenant slug', async () => {
        const { db, create } = makeDb([
            makeTask({ id: 'abc', tenant: { slug: 'globex' } }),
        ]);

        await processTaskDueNotifications(db, { now: NOW });

        expect(lastCreateData(create).linkUrl).toBe('/t/globex/tasks/abc');
    });

    test('no matching tasks → no writes, zeroed result', async () => {
        const { db, create } = makeDb([]);

        const result = await processTaskDueNotifications(db, { now: NOW });

        expect(create).not.toHaveBeenCalled();
        expect(result).toEqual({
            scanned: 0,
            created: 0,
            skippedDuplicate: 0,
            byWindow: { week: 0, day: 0, today: 0 },
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// 5. Query filters — status / soft-delete / assignee / horizon
// ════════════════════════════════════════════════════════════════════

describe('processTaskDueNotifications — query filters', () => {
    test('excludes terminal statuses, soft-deleted, and unassigned tasks', async () => {
        const { db, findMany } = makeDb([]);

        await processTaskDueNotifications(db, { now: NOW });

        const where = findMany.mock.calls[0][0].where;
        expect(where.deletedAt).toBeNull();
        expect(where.assigneeUserId).toEqual({ not: null });
        expect(where.status.notIn).toEqual(
            expect.arrayContaining(['RESOLVED', 'CLOSED', 'CANCELED']),
        );
    });

    test('scans a UTC-midnight → +8-day horizon', async () => {
        const { db, findMany } = makeDb([]);

        await processTaskDueNotifications(db, { now: NOW });

        const where = findMany.mock.calls[0][0].where;
        expect(where.dueAt.gte.toISOString()).toBe('2026-05-20T00:00:00.000Z');
        expect(where.dueAt.lt.toISOString()).toBe('2026-05-28T00:00:00.000Z');
    });
});

// ════════════════════════════════════════════════════════════════════
// 6. Tenant scoping
// ════════════════════════════════════════════════════════════════════

describe('processTaskDueNotifications — tenant scoping', () => {
    test('tenant-scoped run filters the query by tenantId', async () => {
        const { db, findMany } = makeDb([]);

        await processTaskDueNotifications(db, { tenantId: 'tenant-a', now: NOW });

        expect(findMany.mock.calls[0][0].where).toHaveProperty('tenantId', 'tenant-a');
    });

    test('system-wide run does not filter the query by tenantId', async () => {
        const { db, findMany } = makeDb([]);

        await processTaskDueNotifications(db, { now: NOW });

        expect(findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    });

    test('the notification inherits the task tenantId, not the option', async () => {
        // A system-wide scan returns rows from many tenants; each
        // notification must be written to the row's own tenant.
        const { db, create } = makeDb([
            makeTask({ id: 't-b', tenantId: 'tenant-b', tenant: { slug: 'beta' } }),
        ]);

        await processTaskDueNotifications(db, { now: NOW });

        expect(lastCreateData(create).tenantId).toBe('tenant-b');
    });
});

// ════════════════════════════════════════════════════════════════════
// 7. Deduplication — idempotency contract
// ════════════════════════════════════════════════════════════════════

describe('processTaskDueNotifications — deduplication', () => {
    test('a dedupeKey collision (P2002) is counted as skipped, not thrown', async () => {
        const { db, create } = makeDb([makeTask()]);
        create.mockRejectedValueOnce({ code: 'P2002' });

        const result = await processTaskDueNotifications(db, { now: NOW });

        expect(result.created).toBe(0);
        expect(result.skippedDuplicate).toBe(1);
    });

    test('a partial collision skips the duplicate and still writes the rest', async () => {
        const { db, create } = makeDb([
            makeTask({ id: 't-1' }),
            makeTask({ id: 't-2' }),
        ]);
        create.mockRejectedValueOnce({ code: 'P2002' });

        const result = await processTaskDueNotifications(db, { now: NOW });

        expect(result).toMatchObject({ created: 1, skippedDuplicate: 1, scanned: 2 });
    });

    test('a non-P2002 database error propagates', async () => {
        const { db, create } = makeDb([makeTask()]);
        create.mockRejectedValueOnce(new Error('connection reset'));

        await expect(
            processTaskDueNotifications(db, { now: NOW }),
        ).rejects.toThrow('connection reset');
    });
});
