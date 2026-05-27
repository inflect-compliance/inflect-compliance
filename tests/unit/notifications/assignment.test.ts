/**
 * Unit coverage for the assignment notification module (PR-A
 * 2026-05-27). The structural ratchet locks the wiring in task.ts
 * and control/mutations.ts; this file pins the behavioural
 * contract of the helper:
 *
 *   1. dedupeKey shape: `{tenantId}:{TYPE}:{entityId}:{userId}:{YYYY-MM-DD}`.
 *   2. duplicate calls within one day collapse (skipDuplicates).
 *   3. TASK_ASSIGNED and CONTROL_ASSIGNED point at the right
 *      tenant-scoped detail-page URL.
 */

import {
    buildAssignmentDedupeKey,
    createAssignmentNotification,
    type AssignmentTarget,
} from '@/app-layer/notifications/assignment';

describe('buildAssignmentDedupeKey', () => {
    it('formats as tenantId:TYPE:entityId:userId:YYYY-MM-DD', () => {
        const key = buildAssignmentDedupeKey(
            'tenant-1',
            'TASK_ASSIGNED',
            'task-1',
            'user-1',
            new Date('2026-05-27T10:30:00Z'),
        );
        expect(key).toBe(
            'tenant-1:TASK_ASSIGNED:task-1:user-1:2026-05-27',
        );
    });

    it('different KIND produces different key (so TASK + CONTROL of the same id don\'t collide)', () => {
        const taskKey = buildAssignmentDedupeKey(
            'tenant-1',
            'TASK_ASSIGNED',
            'entity-1',
            'user-1',
            new Date('2026-05-27T10:30:00Z'),
        );
        const controlKey = buildAssignmentDedupeKey(
            'tenant-1',
            'CONTROL_ASSIGNED',
            'entity-1',
            'user-1',
            new Date('2026-05-27T10:30:00Z'),
        );
        expect(taskKey).not.toBe(controlKey);
    });
});

function makeTarget(overrides: Partial<AssignmentTarget> = {}): AssignmentTarget {
    return {
        tenantId: 'tenant-1',
        assigneeUserId: 'user-1',
        entityId: 'task-1',
        entityLabel: 'Patch the firewall',
        entityKey: 'T-42',
        tenantSlug: 'acme',
        ...overrides,
    };
}

describe('createAssignmentNotification', () => {
    let createManyMock: jest.Mock;
    let db: {
        notification: {
            createMany: jest.Mock;
        };
    };

    beforeEach(() => {
        createManyMock = jest.fn();
        db = { notification: { createMany: createManyMock } };
    });

    it('returns "created" when a new row is inserted', async () => {
        createManyMock.mockResolvedValueOnce({ count: 1 });
        const result = await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget(),
        );
        expect(result.status).toBe('created');
    });

    it('returns "duplicate" when skipDuplicates collapses the insert', async () => {
        createManyMock.mockResolvedValueOnce({ count: 0 });
        const result = await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget(),
        );
        expect(result.status).toBe('duplicate');
    });

    it('writes type=TASK_ASSIGNED with the tenant-scoped /tasks deep link', async () => {
        createManyMock.mockResolvedValueOnce({ count: 1 });
        await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget({ entityId: 'task-X', tenantSlug: 'acme' }),
        );
        const args = createManyMock.mock.calls[0][0];
        const row = args.data[0];
        expect(row.type).toBe('TASK_ASSIGNED');
        expect(row.linkUrl).toBe('/t/acme/tasks/task-X');
        expect(args.skipDuplicates).toBe(true);
    });

    it('writes type=CONTROL_ASSIGNED with the tenant-scoped /controls deep link', async () => {
        createManyMock.mockResolvedValueOnce({ count: 1 });
        await createAssignmentNotification(
            db as never,
            'CONTROL_ASSIGNED',
            makeTarget({ entityId: 'ctrl-X', tenantSlug: 'acme' }),
        );
        const args = createManyMock.mock.calls[0][0];
        const row = args.data[0];
        expect(row.type).toBe('CONTROL_ASSIGNED');
        expect(row.linkUrl).toBe('/t/acme/controls/ctrl-X');
    });

    it('routes the notification to the assignee user (NOT the actor)', async () => {
        // The recipient of an assignment alert is the NEW assignee,
        // never the actor who made the change — locked here so a
        // future refactor can't accidentally swap to `ctx.userId`.
        createManyMock.mockResolvedValueOnce({ count: 1 });
        await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget({ assigneeUserId: 'recipient-1' }),
        );
        const row = createManyMock.mock.calls[0][0].data[0];
        expect(row.userId).toBe('recipient-1');
    });

    it('uses `entityKey "entityLabel"` body shape when key is present', async () => {
        createManyMock.mockResolvedValueOnce({ count: 1 });
        await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget({ entityKey: 'T-42', entityLabel: 'Patch firewall' }),
        );
        const row = createManyMock.mock.calls[0][0].data[0];
        expect(row.message).toContain('T-42');
        expect(row.message).toContain('"Patch firewall"');
    });

    it('falls back to just `"entityLabel"` when key is null', async () => {
        createManyMock.mockResolvedValueOnce({ count: 1 });
        await createAssignmentNotification(
            db as never,
            'TASK_ASSIGNED',
            makeTarget({ entityKey: null, entityLabel: 'Unkeyed task' }),
        );
        const row = createManyMock.mock.calls[0][0].data[0];
        expect(row.message).toContain('"Unkeyed task"');
    });
});
