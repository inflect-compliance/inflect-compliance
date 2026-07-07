/**
 * PR-6 — training + background-check posture checks (pure), manual-entry
 * usecases (no provider), and the training provider.
 */
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: unknown, fn: (db: unknown) => unknown) => fn(mockDb)),
}));
jest.mock('@/lib/observability/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { runTrainingCheck, type CheckAssignment, type CheckBackgroundCheck } from '@/app-layer/integrations/providers/training/checks';
import { TrainingProvider } from '@/app-layer/integrations/providers/training';
import { assignTraining, completeTrainingAssignment, recordBackgroundCheck, createTrainingCourse } from '@/app-layer/usecases/training';
import { makeRequestContext } from '../helpers/make-context';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const mockDb = {
    trainingCourse: { create: jest.fn(), findFirst: jest.fn() },
    trainingAssignment: { create: jest.fn(), updateMany: jest.fn() },
    backgroundCheck: { create: jest.fn() },
    employee: { findFirst: jest.fn() },
};

function asg(over: Partial<CheckAssignment>): CheckAssignment {
    return { employeeId: over.employeeId ?? 'e1', employeeEmail: over.employeeEmail ?? 'e1@x.com', status: over.status ?? 'COMPLETED', dueAt: 'dueAt' in over ? over.dueAt ?? null : null, completedAt: 'completedAt' in over ? over.completedAt ?? null : NOW, cadenceDays: over.cadenceDays ?? 365 };
}
function bgc(over: Partial<CheckBackgroundCheck>): CheckBackgroundCheck {
    return { employeeId: over.employeeId ?? 'e1', employeeEmail: over.employeeEmail ?? 'e1@x.com', status: over.status ?? 'CLEAR' };
}

describe('runTrainingCheck', () => {
    it('training_completed_annually FAILs an overdue assignment', () => {
        const r = runTrainingCheck('training_completed_annually', { assignments: [asg({ status: 'OVERDUE' })], backgroundChecks: [] }, NOW);
        expect(r.status).toBe('FAILED');
    });
    it('FAILs a past-due ASSIGNED assignment', () => {
        const r = runTrainingCheck('training_completed_annually', { assignments: [asg({ status: 'ASSIGNED', dueAt: new Date('2026-01-01') })], backgroundChecks: [] }, NOW);
        expect(r.status).toBe('FAILED');
    });
    it('FAILs a stale COMPLETED assignment (> cadence)', () => {
        const old = new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000);
        const r = runTrainingCheck('training_completed_annually', { assignments: [asg({ status: 'COMPLETED', completedAt: old, cadenceDays: 365 })], backgroundChecks: [] }, NOW);
        expect(r.status).toBe('FAILED');
    });
    it('PASSes a recently-completed assignment', () => {
        const r = runTrainingCheck('training_completed_annually', { assignments: [asg({ status: 'COMPLETED', completedAt: NOW })], backgroundChecks: [] }, NOW);
        expect(r.status).toBe('PASSED');
    });
    it('background_check_complete PASSes CLEAR, FAILs otherwise', () => {
        expect(runTrainingCheck('background_check_complete', { assignments: [], backgroundChecks: [bgc({ status: 'CLEAR' })] }, NOW).status).toBe('PASSED');
        expect(runTrainingCheck('background_check_complete', { assignments: [], backgroundChecks: [bgc({ status: 'CONSIDER' })] }, NOW).status).toBe('FAILED');
        expect(runTrainingCheck('background_check_complete', { assignments: [], backgroundChecks: [bgc({ status: 'PENDING' })] }, NOW).status).toBe('FAILED');
    });
    it('unknown check ERRORs', () => {
        expect(runTrainingCheck('nope', { assignments: [], backgroundChecks: [] }, NOW).status).toBe('ERROR');
    });
});

describe('manual-entry usecases (no provider)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDb.employee.findFirst.mockResolvedValue({ id: 'e1' });
        mockDb.trainingCourse.findFirst.mockResolvedValue({ id: 'c1' });
        mockDb.trainingCourse.create.mockResolvedValue({ id: 'c1', name: 'Sec 101' });
        mockDb.trainingAssignment.create.mockResolvedValue({ id: 'a1' });
        mockDb.trainingAssignment.updateMany.mockResolvedValue({ count: 1 });
        mockDb.backgroundCheck.create.mockResolvedValue({ id: 'b1' });
    });

    it('assignTraining creates an assignment after validating refs', async () => {
        const ctx = makeRequestContext('ADMIN');
        await assignTraining(ctx, { employeeId: 'e1', courseId: 'c1' });
        expect(mockDb.trainingAssignment.create).toHaveBeenCalled();
        expect(mockDb.trainingAssignment.create.mock.calls[0][0].data.tenantId).toBe(ctx.tenantId);
    });

    it('completeTrainingAssignment marks COMPLETED', async () => {
        const ctx = makeRequestContext('ADMIN');
        const r = await completeTrainingAssignment(ctx, 'a1', NOW);
        expect(r.completed).toBe(true);
        expect(mockDb.trainingAssignment.updateMany.mock.calls[0][0].data.status).toBe('COMPLETED');
    });

    it('recordBackgroundCheck stores status + result (encrypted at rest via manifest)', async () => {
        const ctx = makeRequestContext('ADMIN');
        await recordBackgroundCheck(ctx, { employeeId: 'e1', status: 'CLEAR', resultSummary: 'no adverse findings' }, NOW);
        const data = mockDb.backgroundCheck.create.mock.calls[0][0].data;
        expect(data.status).toBe('CLEAR');
        expect(data.completedAt).toBe(NOW);
        expect(data.resultSummary).toBe('no adverse findings');
    });

    it('createTrainingCourse forbids a reader', async () => {
        const ctx = makeRequestContext('READER');
        await expect(createTrainingCourse(ctx, { name: 'X' })).rejects.toThrow(/permission/i);
    });
});

describe('TrainingProvider', () => {
    it('runCheck applies the check to injected data', async () => {
        const provider = new TrainingProvider({ load: async () => ({ assignments: [asg({ status: 'OVERDUE' })], backgroundChecks: [] }), now: () => NOW });
        const r = await provider.runCheck({ automationKey: 'training.training_completed_annually', parsed: { provider: 'training', checkType: 'training_completed_annually', raw: '' }, tenantId: 'T1', connectionConfig: {}, triggeredBy: 'scheduled' });
        expect(r.status).toBe('FAILED');
        expect(provider.supportedChecks).toContain('background_check_complete');
    });
});
