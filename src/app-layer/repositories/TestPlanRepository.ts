/**
 * Test Plan repository — CRUD operations for ControlTestPlan.
 */
import { Prisma } from '@prisma/client';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export const TestPlanRepository = {
    async listByControl(db: PrismaTx, ctx: RequestContext, controlId: string) {
        return db.controlTestPlan.findMany({
            where: { tenantId: ctx.tenantId, controlId },
            include: {
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { runs: true, steps: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    async getById(db: PrismaTx, ctx: RequestContext, planId: string) {
        return db.controlTestPlan.findFirst({
            where: { id: planId, tenantId: ctx.tenantId },
            include: {
                owner: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } },
                steps: { orderBy: { sortOrder: 'asc' } },
                runs: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        executedBy: { select: { id: true, name: true, email: true } },
                        _count: { select: { evidence: true } },
                    },
                },
                _count: { select: { runs: true, steps: true } },
            },
        });
    },

    async create(db: PrismaTx, ctx: RequestContext, controlId: string, data: {
        name: string;
        description?: string | null;
        method?: string;
        frequency?: string;
        ownerUserId?: string | null;
        expectedEvidence?: unknown;
        steps?: Array<{ instruction: string; expectedOutput?: string | null }>;
    }) {
        const plan = await db.controlTestPlan.create({
            data: {
                tenantId: ctx.tenantId,
                controlId,
                name: data.name,
                description: data.description ?? null,
                method: (data.method as 'MANUAL' | 'AUTOMATED') || 'MANUAL',
                frequency: (data.frequency as 'AD_HOC' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY') || 'AD_HOC',
                ownerUserId: data.ownerUserId ?? null,
                expectedEvidence: data.expectedEvidence ? JSON.parse(JSON.stringify(data.expectedEvidence)) : undefined,
                createdByUserId: ctx.userId,
            },
        });

        // Create steps if provided
        if (data.steps && data.steps.length > 0) {
            await db.controlTestStep.createMany({
                data: data.steps.map((step, i) => ({
                    tenantId: ctx.tenantId,
                    testPlanId: plan.id,
                    sortOrder: i,
                    instruction: step.instruction,
                    expectedOutput: step.expectedOutput ?? null,
                })),
            });
        }

        return plan;
    },

    async update(db: PrismaTx, ctx: RequestContext, planId: string, patch: {
        name?: string;
        description?: string | null;
        method?: string;
        frequency?: string;
        ownerUserId?: string | null;
        expectedEvidence?: unknown;
        status?: string;
    }) {
        const data: Record<string, unknown> = {};
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.description !== undefined) data.description = patch.description;
        if (patch.method !== undefined) data.method = patch.method;
        if (patch.frequency !== undefined) data.frequency = patch.frequency;
        if (patch.ownerUserId !== undefined) data.ownerUserId = patch.ownerUserId;
        if (patch.expectedEvidence !== undefined) data.expectedEvidence = JSON.parse(JSON.stringify(patch.expectedEvidence));
        if (patch.status !== undefined) data.status = patch.status;

        return db.controlTestPlan.update({
            where: { id: planId },
            data,
        });
    },

    async updateNextDueAt(db: PrismaTx, _ctx: RequestContext, planId: string, nextDueAt: Date | null) {
        return db.controlTestPlan.update({
            where: { id: planId },
            data: { nextDueAt },
        });
    },

    /** Fetch the tenant's test plans for the given ids (bulk-action audit source). */
    async listByIds(db: PrismaTx, ctx: RequestContext, ids: string[]) {
        // Bounded by the `in: ids` set (bulk schemas cap at 100 ids); a `take:`
        // would be redundant.
        return db.controlTestPlan.findMany({ // guardrail-allow: unbounded
            where: { id: { in: ids }, tenantId: ctx.tenantId },
        });
    },

    /**
     * Tenant-scoped bulk update — one `updateMany` so the bulk-action path
     * never reads/writes per-id in a loop. Returns the affected-row count.
     */
    async bulkUpdate(
        db: PrismaTx,
        ctx: RequestContext,
        ids: string[],
        data: Omit<Prisma.ControlTestPlanUncheckedUpdateInput, 'tenantId'>,
    ) {
        return db.controlTestPlan.updateMany({
            where: { id: { in: ids }, tenantId: ctx.tenantId },
            data,
        });
    },
};
