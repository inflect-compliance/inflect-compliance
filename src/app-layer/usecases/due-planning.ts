/**
 * Due Planning & Dashboard Metrics
 *
 * runDuePlanning()  — idempotent: creates PLANNED runs for due test plans
 * getDueQueue()     — returns overdue + due-soon plans
 * getTestDashboardMetrics() — computes all dashboard metrics server-side
 * listAllTestPlans() — lists all plans across controls (fixes N+1)
 */
import { Prisma, TestPlanStatus } from '@prisma/client';
import { RequestContext } from '../types';
import { assertCanReadTests, assertCanManageTestPlans } from '../policies/test.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext, type PrismaTx } from '@/lib/db-context';

// ─── Due Queue ───

export async function getDueQueue(ctx: RequestContext) {
    assertCanReadTests(ctx);

    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 7);

    const plans = await runInTenantContext(ctx, async (db: PrismaTx) => {
        return db.controlTestPlan.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
                nextDueAt: { lte: soon },
                frequency: { not: 'AD_HOC' },
            },
            include: {
                control: { select: { id: true, name: true, code: true } },
                owner: { select: { id: true, name: true, email: true } },
                runs: {
                    where: { status: { in: ['PLANNED', 'RUNNING'] } },
                    select: { id: true, status: true, createdAt: true },
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                },
                _count: { select: { runs: true } },
            },
            orderBy: { nextDueAt: 'asc' },
        });
    });

    return plans.map((p) => ({
        ...p,
        isOverdue: p.nextDueAt ? p.nextDueAt <= now : false,
        hasPendingRun: p.runs?.length > 0,
    }));
}

// ─── Due Planning (Idempotent) ───

export async function runDuePlanning(ctx: RequestContext) {
    assertCanManageTestPlans(ctx);

    return runInTenantContext(ctx, async (db: PrismaTx) => {
        const now = new Date();

        // Find ACTIVE plans that are due and don't already have a PLANNED/RUNNING run
        const duePlans = await db.controlTestPlan.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
                nextDueAt: { lte: now },
                frequency: { not: 'AD_HOC' },
            },
            include: {
                runs: {
                    where: { status: { in: ['PLANNED', 'RUNNING'] } },
                    select: { id: true },
                    take: 1,
                },
            },
        });

        // Filter to only plans without pending runs (idempotent)
        const needsRun = duePlans.filter((p) => p.runs.length === 0);

        const created: string[] = [];
        for (const plan of needsRun) {
            const run = await db.controlTestRun.create({
                data: {
                    tenantId: ctx.tenantId,
                    controlId: plan.controlId,
                    testPlanId: plan.id,
                    status: 'PLANNED',
                    createdByUserId: ctx.userId,
                    requestId: ctx.requestId,
                },
            });
            created.push(run.id);
        }

        await logEvent(db, ctx, {
            action: 'DUE_PLANNING_EXECUTED',
            entityType: 'ControlTestPlan',
            entityId: 'batch',
            details: JSON.stringify({ checked: duePlans.length, created: created.length, runIds: created }),
            detailsJson: {
                category: 'custom',
                event: 'due_planning_executed',
                checked: duePlans.length,
                created: created.length,
                runIds: created,
            },
        });

        return {
            checked: duePlans.length,
            alreadyPending: duePlans.length - needsRun.length,
            created: created.length,
            runIds: created,
        };
    });
}

// ─── Dashboard Metrics ───

interface RunRecord {
    id: string;
    status: string;
    result: string | null;
    controlId: string;
    evidence: { id: string }[];
}

export async function getTestDashboardMetrics(ctx: RequestContext, periodDays: number = 30) {
    assertCanReadTests(ctx);

    return runInTenantContext(ctx, async (db: PrismaTx) => {
        const now = new Date();
        const periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - periodDays);

        // All runs in period
        const runsInPeriod: RunRecord[] = await db.controlTestRun.findMany({
            where: {
                tenantId: ctx.tenantId,
                createdAt: { gte: periodStart },
            },
            select: {
                id: true, status: true, result: true, controlId: true,
                evidence: { select: { id: true } },
            },
        });

        const totalRuns = runsInPeriod.length;
        const completedRuns = runsInPeriod.filter((r: RunRecord) => r.status === 'COMPLETED');
        const passRuns = completedRuns.filter((r: RunRecord) => r.result === 'PASS');
        const failRuns = completedRuns.filter((r: RunRecord) => r.result === 'FAIL');
        const inconclusiveRuns = completedRuns.filter((r: RunRecord) => r.result === 'INCONCLUSIVE');
        const runsWithEvidence = completedRuns.filter((r: RunRecord) => r.evidence.length > 0);

        // Completion rate
        const completionRate = totalRuns > 0 ? Math.round((completedRuns.length / totalRuns) * 100) : 0;
        const passRate = completedRuns.length > 0 ? Math.round((passRuns.length / completedRuns.length) * 100) : 0;
        const failRate = completedRuns.length > 0 ? Math.round((failRuns.length / completedRuns.length) * 100) : 0;
        const evidenceRate = completedRuns.length > 0 ? Math.round((runsWithEvidence.length / completedRuns.length) * 100) : 0;

        // Overdue plans
        const overduePlans = await db.controlTestPlan.count({
            where: {
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
                nextDueAt: { lt: now },
                frequency: { not: 'AD_HOC' },
            },
        });

        // Controls with repeated failures (≥2 FAIL in period)
        const failsByControl: Record<string, number> = {};
        for (const r of failRuns) {
            failsByControl[r.controlId] = (failsByControl[r.controlId] || 0) + 1;
        }
        const repeatedFailures = Object.entries(failsByControl)
            .filter(([, count]) => count >= 2)
            .map(([controlId, count]) => ({ controlId, failCount: count }));

        // Get control names for repeated failures
        let repeatedFailureDetails: Array<{ controlId: string; controlName: string; controlCode: string | null; failCount: number }> = [];
        if (repeatedFailures.length > 0) {
            const controls = await db.control.findMany({
                where: { id: { in: repeatedFailures.map((f: { controlId: string }) => f.controlId) }, tenantId: ctx.tenantId },
                select: { id: true, name: true, code: true },
            });
            const cMap = new Map(controls.map((c) => [c.id, c]));
            repeatedFailureDetails = repeatedFailures.map(f => ({
                controlId: f.controlId,
                controlName: cMap.get(f.controlId)?.name || 'Unknown',
                controlCode: cMap.get(f.controlId)?.code || null,
                failCount: f.failCount,
            }));
        }

        // Total plans
        const totalPlans = await db.controlTestPlan.count({
            where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
        });

        return {
            periodDays,
            periodStart: periodStart.toISOString(),
            totalPlans,
            totalRuns,
            completedRuns: completedRuns.length,
            passRuns: passRuns.length,
            failRuns: failRuns.length,
            inconclusiveRuns: inconclusiveRuns.length,
            completionRate,
            passRate,
            failRate,
            evidenceRate,
            overduePlans,
            repeatedFailures: repeatedFailureDetails,
            runsWithEvidence: runsWithEvidence.length,
        };
    });
}

// ─── All Plans (fixes N+1) ───

export interface TestPlanFilters {
    status?: string;
    controlId?: string;
    due?: 'overdue' | 'next7d';
    q?: string;
}

export async function listAllTestPlans(ctx: RequestContext, filters: TestPlanFilters = {}) {
    assertCanReadTests(ctx);

    return runInTenantContext(ctx, async (db: PrismaTx) => {
        const where: Prisma.ControlTestPlanWhereInput = { tenantId: ctx.tenantId };

        if (filters.status) where.status = filters.status as TestPlanStatus;
        if (filters.controlId) where.controlId = filters.controlId;
        if (filters.due === 'overdue') {
            where.nextDueAt = { lt: new Date() };
        } else if (filters.due === 'next7d') {
            const now = new Date();
            const in7 = new Date(now.getTime() + 7 * 86400000);
            where.nextDueAt = { gte: now, lte: in7 };
        }
        if (filters.q) {
            where.name = { contains: filters.q, mode: 'insensitive' };
        }

        return db.controlTestPlan.findMany({
            where,
            include: {
                control: { select: { id: true, name: true, code: true } },
                owner: { select: { id: true, name: true, email: true } },
                runs: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, result: true, status: true, executedAt: true },
                },
                _count: { select: { runs: true, steps: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    });
}
