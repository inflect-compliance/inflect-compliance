/* eslint-disable @typescript-eslint/no-explicit-any -- standard test-mock pattern. */

/**
 * Action Execution Engine — proves each action type produces a REAL side
 * effect (the gap this PR closes: the engine used to record intent and do
 * nothing).
 */
const enqueueMock = jest.fn();
jest.mock('@/app-layer/jobs/queue', () => ({ enqueue: (...a: unknown[]) => enqueueMock(...a) }));

import { executeAction } from '@/app-layer/automation/action-executor';

const baseEvent = {
    tenantId: 't1',
    event: 'RISK_CREATED',
    entityType: 'Risk',
    entityId: 'risk-1',
    actorUserId: 'u1',
    data: { riskId: 'risk-1' },
};

function makeDb() {
    return {
        // membership filter: echo back whatever userIds were requested as members
        tenantMembership: {
            findMany: jest.fn(async (args: any) =>
                (args.where.userId.in as string[]).map((userId: string) => ({ userId })),
            ),
        },
        notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        task: { create: jest.fn().mockResolvedValue({ id: 'task-1' }) },
        risk: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;
}

beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as any) = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

describe('executeAction', () => {
    it('NOTIFY_USER creates a notification row per recipient', async () => {
        const db = makeDb();
        const res = await executeAction(db, {
            id: 'r1', name: 'Alert', actionType: 'NOTIFY_USER', createdByUserId: 'u1',
            actionConfigJson: { userIds: ['a', 'b'], message: 'heads up' },
        }, baseEvent);
        expect(res.ok).toBe(true);
        const arg = db.notification.createMany.mock.calls[0][0];
        expect(arg.data).toHaveLength(2);
        expect(arg.data[0]).toMatchObject({ tenantId: 't1', userId: 'a', message: 'heads up' });
    });

    it('CREATE_TASK creates a task owned by the actor', async () => {
        const db = makeDb();
        const res = await executeAction(db, {
            id: 'r1', name: 'Remediate', actionType: 'CREATE_TASK', createdByUserId: 'u9',
            actionConfigJson: { title: 'Fix it', severity: 'HIGH' },
        }, baseEvent);
        expect(res.ok).toBe(true);
        expect(res.detail).toEqual({ taskId: 'task-1' });
        expect(db.task.create.mock.calls[0][0].data).toMatchObject({
            tenantId: 't1', title: 'Fix it', severity: 'HIGH', createdByUserId: 'u1', source: 'INTEGRATION',
        });
    });

    it('UPDATE_STATUS writes the field on the event entity', async () => {
        const db = makeDb();
        const res = await executeAction(db, {
            id: 'r1', name: 'Close', actionType: 'UPDATE_STATUS', createdByUserId: 'u1',
            actionConfigJson: { entityType: 'Risk', field: 'status', toStatus: 'MITIGATED' },
        }, baseEvent);
        expect(res.ok).toBe(true);
        expect(db.risk.updateMany).toHaveBeenCalledWith({
            where: { id: 'risk-1', tenantId: 't1' },
            data: { status: 'MITIGATED' },
        });
    });

    it('WEBHOOK fires a real signed HTTP POST', async () => {
        const db = makeDb();
        const res = await executeAction(db, {
            id: 'r1', name: 'Push', actionType: 'WEBHOOK', createdByUserId: 'u1',
            actionConfigJson: { url: 'https://example.com/hook', secretRef: 'shh' },
        }, baseEvent);
        expect(res.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = (global.fetch as any).mock.calls[0];
        expect(url).toBe('https://example.com/hook');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Inflect-Signature']).toMatch(/^sha256=/);
    });

    it('INVOKE_SUBFLOW enqueues the sub-flow dispatch', async () => {
        const db = makeDb();
        const res = await executeAction(db, {
            id: 'r1', name: 'Branch', actionType: 'INVOKE_SUBFLOW', createdByUserId: 'u1',
            actionConfigJson: { targetGroupId: 'g1' },
        }, baseEvent);
        expect(res.ok).toBe(true);
        expect(enqueueMock).toHaveBeenCalledWith('subflow-dispatch', expect.objectContaining({ targetGroupId: 'g1' }));
    });

    it('returns ok:false (never throws) when a handler errors', async () => {
        const db = makeDb();
        db.notification.createMany.mockRejectedValue(new Error('db down'));
        const res = await executeAction(db, {
            id: 'r1', name: 'Alert', actionType: 'NOTIFY_USER', createdByUserId: 'u1',
            actionConfigJson: { userIds: ['a'], message: 'x' },
        }, baseEvent);
        expect(res.ok).toBe(false);
        expect(res.summary).toMatch(/failed/i);
    });
});
