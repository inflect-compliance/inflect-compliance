/**
 * Unit tests for the RiskTreatmentPlan / TreatmentMilestone Zod schemas (Epic G-7).
 */
import {
    CreateTreatmentPlanSchema,
    AddMilestoneSchema,
    CompleteMilestoneSchema,
    CompletePlanSchema,
    ChangeStrategySchema,
    TransferOwnershipSchema,
} from '@/app-layer/schemas/risk-treatment-plan.schemas';

describe('risk-treatment-plan.schemas', () => {
    describe('CreateTreatmentPlanSchema', () => {
        it('accepts a valid input and coerces targetDate to Date', () => {
            const r = CreateTreatmentPlanSchema.parse({
                riskId: 'risk-1',
                strategy: 'MITIGATE',
                ownerUserId: 'user-1',
                targetDate: '2026-01-01T00:00:00.000Z',
            });
            expect(r.targetDate).toBeInstanceOf(Date);
            expect(r.strategy).toBe('MITIGATE');
        });

        it('accepts a Date object for targetDate', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: 'risk-1',
                    strategy: 'ACCEPT',
                    ownerUserId: 'user-1',
                    targetDate: new Date(),
                }).success,
            ).toBe(true);
        });

        it('rejects an empty riskId', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: '',
                    strategy: 'MITIGATE',
                    ownerUserId: 'u',
                    targetDate: new Date(),
                }).success,
            ).toBe(false);
        });

        it('rejects an empty ownerUserId', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: 'r',
                    strategy: 'MITIGATE',
                    ownerUserId: '',
                    targetDate: new Date(),
                }).success,
            ).toBe(false);
        });

        it('rejects an invalid strategy', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: 'r',
                    strategy: 'IGNORE',
                    ownerUserId: 'u',
                    targetDate: new Date(),
                }).success,
            ).toBe(false);
        });

        it('rejects a missing targetDate', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: 'r',
                    strategy: 'AVOID',
                    ownerUserId: 'u',
                }).success,
            ).toBe(false);
        });

        it('rejects a non-ISO string targetDate', () => {
            expect(
                CreateTreatmentPlanSchema.safeParse({
                    riskId: 'r',
                    strategy: 'TRANSFER',
                    ownerUserId: 'u',
                    targetDate: 'not-a-date',
                }).success,
            ).toBe(false);
        });
    });

    describe('AddMilestoneSchema', () => {
        it('accepts a minimal valid input and trims title', () => {
            const r = AddMilestoneSchema.parse({
                title: '  do the thing  ',
                dueDate: '2026-01-01T00:00:00.000Z',
            });
            expect(r.title).toBe('do the thing');
            expect(r.dueDate).toBeInstanceOf(Date);
        });

        it('accepts a fully populated input', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    description: 'desc',
                    dueDate: new Date(),
                    sortOrder: 3,
                    evidence: 'https://example.com/x',
                }).success,
            ).toBe(true);
        });

        it('accepts null description and null evidence', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    description: null,
                    evidence: null,
                }).success,
            ).toBe(true);
        });

        it('rejects an empty title', () => {
            expect(
                AddMilestoneSchema.safeParse({ title: '', dueDate: new Date() }).success,
            ).toBe(false);
        });

        it('rejects a title over 2000 chars', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 'a'.repeat(2001),
                    dueDate: new Date(),
                }).success,
            ).toBe(false);
        });

        it('rejects a description over 8000 chars', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    description: 'a'.repeat(8001),
                }).success,
            ).toBe(false);
        });

        it('rejects a negative sortOrder', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    sortOrder: -1,
                }).success,
            ).toBe(false);
        });

        it('rejects a non-integer sortOrder', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    sortOrder: 1.5,
                }).success,
            ).toBe(false);
        });

        it('rejects an empty evidence string', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    evidence: '',
                }).success,
            ).toBe(false);
        });

        it('rejects an evidence string over 2000 chars', () => {
            expect(
                AddMilestoneSchema.safeParse({
                    title: 't',
                    dueDate: new Date(),
                    evidence: 'a'.repeat(2001),
                }).success,
            ).toBe(false);
        });

        it('rejects a missing dueDate', () => {
            expect(AddMilestoneSchema.safeParse({ title: 't' }).success).toBe(false);
        });
    });

    describe('CompleteMilestoneSchema', () => {
        it('accepts an empty object', () => {
            expect(CompleteMilestoneSchema.safeParse({}).success).toBe(true);
        });

        it('accepts an evidence string and null', () => {
            expect(CompleteMilestoneSchema.safeParse({ evidence: 'ref' }).success).toBe(true);
            expect(CompleteMilestoneSchema.safeParse({ evidence: null }).success).toBe(true);
        });

        it('rejects an empty evidence string', () => {
            expect(CompleteMilestoneSchema.safeParse({ evidence: '' }).success).toBe(false);
        });

        it('rejects an evidence string over 2000 chars', () => {
            expect(
                CompleteMilestoneSchema.safeParse({ evidence: 'a'.repeat(2001) }).success,
            ).toBe(false);
        });
    });

    describe('CompletePlanSchema', () => {
        it('accepts a valid closingRemark and trims it', () => {
            const r = CompletePlanSchema.parse({ closingRemark: '  done  ' });
            expect(r.closingRemark).toBe('done');
        });

        it('rejects an empty closingRemark', () => {
            expect(CompletePlanSchema.safeParse({ closingRemark: '' }).success).toBe(false);
        });

        it('rejects a closingRemark over 2000 chars', () => {
            expect(
                CompletePlanSchema.safeParse({ closingRemark: 'a'.repeat(2001) }).success,
            ).toBe(false);
        });

        it('rejects a missing closingRemark', () => {
            expect(CompletePlanSchema.safeParse({}).success).toBe(false);
        });
    });

    describe('ChangeStrategySchema', () => {
        it('accepts a valid input', () => {
            expect(
                ChangeStrategySchema.safeParse({ strategy: 'TRANSFER', reason: 'cheaper' }).success,
            ).toBe(true);
        });

        it('rejects an invalid strategy', () => {
            expect(
                ChangeStrategySchema.safeParse({ strategy: 'X', reason: 'why' }).success,
            ).toBe(false);
        });

        it('rejects an empty reason', () => {
            expect(
                ChangeStrategySchema.safeParse({ strategy: 'AVOID', reason: '' }).success,
            ).toBe(false);
        });
    });

    describe('TransferOwnershipSchema', () => {
        it('accepts a valid input', () => {
            expect(
                TransferOwnershipSchema.safeParse({
                    newOwnerUserId: 'u2',
                    reason: 'departure',
                }).success,
            ).toBe(true);
        });

        it('rejects an empty newOwnerUserId', () => {
            expect(
                TransferOwnershipSchema.safeParse({ newOwnerUserId: '', reason: 'r' }).success,
            ).toBe(false);
        });

        it('rejects an empty reason', () => {
            expect(
                TransferOwnershipSchema.safeParse({ newOwnerUserId: 'u2', reason: '' }).success,
            ).toBe(false);
        });
    });
});
