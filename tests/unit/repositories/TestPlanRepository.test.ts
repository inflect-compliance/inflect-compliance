/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — TestPlanRepository (previously ~0% branches).
 *
 * Fake `db` boundary. Branch focus:
 *   - create(): description/ownerUserId nullish-coalescing, method/frequency
 *     defaulting, expectedEvidence present vs absent, steps present (createMany)
 *     vs absent/empty (skip)
 *   - update(): every `patch.x !== undefined` arm, both included and omitted
 *   - listByControl / getById / listByIds / bulkUpdate / updateNextDueAt shapes
 */

import { TestPlanRepository } from '@/app-layer/repositories/TestPlanRepository';
import { makeRequestContext } from '../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

function freshDb() {
    return {
        controlTestPlan: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
            create: jest.fn().mockResolvedValue({ id: 'p1' }),
            update: jest.fn().mockResolvedValue({ id: 'p1' }),
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        controlTestStep: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
    };
}

let db: ReturnType<typeof freshDb>;

beforeEach(() => {
    jest.clearAllMocks();
    db = freshDb();
});

describe('listByControl', () => {
    it('filters by tenant + control, includes owner/_count, orders desc', async () => {
        await TestPlanRepository.listByControl(db as any, ctx, 'c1');
        const arg = db.controlTestPlan.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ tenantId: 'tenant-1', controlId: 'c1' });
        expect(arg.include._count.select).toEqual({ runs: true, steps: true });
        expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });
});

describe('getById', () => {
    it('scopes by id + tenant, caps runs at 10, orders steps asc', async () => {
        await TestPlanRepository.getById(db as any, ctx, 'p1');
        const arg = db.controlTestPlan.findFirst.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'p1', tenantId: 'tenant-1' });
        expect(arg.include.steps.orderBy).toEqual({ sortOrder: 'asc' });
        expect(arg.include.runs.take).toBe(10);
        expect(arg.include.runs.orderBy).toEqual({ createdAt: 'desc' });
    });
});

describe('create', () => {
    it('applies defaults + nulls when optional fields absent, no steps written', async () => {
        await TestPlanRepository.create(db as any, ctx, 'c1', { name: 'P' });
        const arg = db.controlTestPlan.create.mock.calls[0][0];
        // Branch: description/ownerUserId nullish → null; method/frequency default.
        expect(arg.data).toMatchObject({
            tenantId: 'tenant-1',
            controlId: 'c1',
            name: 'P',
            description: null,
            method: 'MANUAL',
            frequency: 'AD_HOC',
            ownerUserId: null,
            createdByUserId: 'user-1',
        });
        // Branch: expectedEvidence falsy → undefined.
        expect(arg.data.expectedEvidence).toBeUndefined();
        // Branch: no steps → createMany not called.
        expect(db.controlTestStep.createMany).not.toHaveBeenCalled();
    });

    it('DERIVES method from automationType, passes frequency/owner, serializes expectedEvidence, writes steps', async () => {
        await TestPlanRepository.create(db as any, ctx, 'c1', {
            name: 'P',
            description: 'd',
            // `method` is NOT an input — it is derived from automationType so the
            // auditor-facing projection can never drift from how execution runs.
            automationType: 'SCRIPT',
            frequency: 'WEEKLY',
            ownerUserId: 'u9',
            expectedEvidence: { foo: 'bar' },
            steps: [
                { instruction: 'step a' },
                { instruction: 'step b', expectedOutput: 'out' },
            ],
        });
        const arg = db.controlTestPlan.create.mock.calls[0][0];
        expect(arg.data.description).toBe('d');
        expect(arg.data.method).toBe('AUTOMATED'); // derived from SCRIPT
        expect(arg.data.frequency).toBe('WEEKLY');
        expect(arg.data.ownerUserId).toBe('u9');
        // Branch: expectedEvidence truthy → JSON round-trip clone.
        expect(arg.data.expectedEvidence).toEqual({ foo: 'bar' });

        // Branch: steps present → createMany with sortOrder + expectedOutput coalescing.
        const stepsArg = db.controlTestStep.createMany.mock.calls[0][0];
        expect(stepsArg.data).toEqual([
            { tenantId: 'tenant-1', testPlanId: 'p1', sortOrder: 0, instruction: 'step a', expectedOutput: null },
            { tenantId: 'tenant-1', testPlanId: 'p1', sortOrder: 1, instruction: 'step b', expectedOutput: 'out' },
        ]);
    });

    it('skips createMany for an empty steps array (length-0 branch)', async () => {
        await TestPlanRepository.create(db as any, ctx, 'c1', { name: 'P', steps: [] });
        expect(db.controlTestStep.createMany).not.toHaveBeenCalled();
    });
});

describe('update', () => {
    it('builds a sparse data object including only defined patch keys', async () => {
        await TestPlanRepository.update(db as any, ctx, 'p1', {
            name: 'N',
            description: null,
            method: 'MANUAL',
            frequency: 'DAILY',
            ownerUserId: 'u1',
            expectedEvidence: { a: 1 },
            status: 'ACTIVE',
        });
        const arg = db.controlTestPlan.update.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'p1' });
        expect(arg.data).toEqual({
            name: 'N',
            description: null,
            method: 'MANUAL',
            frequency: 'DAILY',
            ownerUserId: 'u1',
            expectedEvidence: { a: 1 },
            status: 'ACTIVE',
        });
    });

    it('omits undefined patch keys (all-absent branch → empty data)', async () => {
        await TestPlanRepository.update(db as any, ctx, 'p1', {});
        const arg = db.controlTestPlan.update.mock.calls[0][0];
        expect(arg.data).toEqual({});
    });
});

describe('updateNextDueAt', () => {
    it('writes nextDueAt by id', async () => {
        const when = new Date('2026-01-01');
        await TestPlanRepository.updateNextDueAt(db as any, ctx, 'p1', when);
        const arg = db.controlTestPlan.update.mock.calls[0][0];
        expect(arg).toEqual({ where: { id: 'p1' }, data: { nextDueAt: when } });
    });

    it('accepts null nextDueAt', async () => {
        await TestPlanRepository.updateNextDueAt(db as any, ctx, 'p1', null);
        expect(db.controlTestPlan.update.mock.calls[0][0].data).toEqual({ nextDueAt: null });
    });
});

describe('listByIds', () => {
    it('scopes by id-set + tenant', async () => {
        await TestPlanRepository.listByIds(db as any, ctx, ['a', 'b']);
        const arg = db.controlTestPlan.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: { in: ['a', 'b'] }, tenantId: 'tenant-1' });
    });
});

describe('bulkUpdate', () => {
    it('updateMany scoped by id-set + tenant', async () => {
        const res = await TestPlanRepository.bulkUpdate(db as any, ctx, ['a'], { status: 'ARCHIVED' } as any);
        const arg = db.controlTestPlan.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: { in: ['a'] }, tenantId: 'tenant-1' });
        expect(arg.data).toEqual({ status: 'ARCHIVED' });
        expect(res).toEqual({ count: 2 });
    });
});
