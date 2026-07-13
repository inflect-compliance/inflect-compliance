/**
 * Control health synthesis (R2-P2).
 *
 * The control detail page was 8 self-fetching tabs the user had to assemble
 * into a judgement. This aggregates the "is this control implemented and
 * operating?" signals into ONE payload so the Overview can answer it without
 * tab-hopping: implementation status + applicability + latest manual-test
 * result + latest automated-check status + effectiveness (pass rate) + how
 * much posture the control carries (requirement/framework coverage).
 *
 * Read-only; a single `controls.view` gate. All queries are controlId-scoped.
 */
import { RequestContext } from '../../types';
import { assertCanReadControls } from '../../policies/control.policies';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { listExecutionsForControl } from '../integrations';

export interface ControlHealthDTO {
    status: string;
    applicability: string;
    lastTested: string | null;
    latestTestResult: string | null; // PASS | FAIL | INCONCLUSIVE
    latestTestAt: string | null;
    latestCheckStatus: string | null; // PASSED | FAILED | ERROR | NOT_APPLICABLE
    latestCheckAt: string | null;
    effectiveness: {
        passRate: number | null;
        total: number;
        passes: number;
        fails: number;
        windowDays: number;
    };
    coverage: {
        requirementCount: number;
        frameworkCount: number;
        frameworks: string[];
    };
}

const EFFECTIVENESS_WINDOW_DAYS = 90;

export async function getControlHealth(
    ctx: RequestContext,
    controlId: string,
): Promise<ControlHealthDTO> {
    assertCanReadControls(ctx);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EFFECTIVENESS_WINDOW_DAYS);

    const core = await runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({
            where: { id: controlId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
            select: { id: true, status: true, applicability: true, lastTested: true },
        });
        if (!control) return null;

        // Latest completed manual test run (result + when).
        const latestTest = await db.controlTestRun.findFirst({
            where: { tenantId: ctx.tenantId, controlId, status: 'COMPLETED', result: { not: null } },
            orderBy: { executedAt: 'desc' },
            select: { result: true, executedAt: true },
        });

        // Effectiveness pass-rate over the rolling window (was computed by
        // getControlEffectiveness but rendered nowhere — surfaced here).
        const grouped = await db.controlTestRun.groupBy({
            by: ['result'],
            where: { tenantId: ctx.tenantId, controlId, status: 'COMPLETED', executedAt: { gte: cutoff } },
            _count: { _all: true },
        });

        // Coverage contribution — canonical controlRequirementLink + frameworks.
        const links = await db.controlRequirementLink.findMany({
            where: { tenantId: ctx.tenantId, controlId },
            select: { requirement: { select: { framework: { select: { name: true } } } } },
            take: 500, // a control maps to a bounded set of requirements
        });

        return { control, latestTest, grouped, links };
    });

    if (!core) throw notFound('Control not found');
    const { control, latestTest, grouped, links } = core;

    let passes = 0, fails = 0, inconclusive = 0;
    for (const g of grouped) {
        const n = g._count._all;
        if (g.result === 'PASS') passes = n;
        else if (g.result === 'FAIL') fails = n;
        else if (g.result === 'INCONCLUSIVE') inconclusive = n;
    }
    const total = passes + fails + inconclusive;

    const checks = await listExecutionsForControl(ctx, controlId, { limit: 1 });
    const latestCheck = checks[0] ?? null;

    const frameworks = [...new Set(links.map((l) => l.requirement.framework.name))];

    return {
        status: control.status,
        applicability: control.applicability,
        lastTested: control.lastTested ? control.lastTested.toISOString() : null,
        latestTestResult: latestTest?.result ?? null,
        latestTestAt: latestTest?.executedAt ? latestTest.executedAt.toISOString() : null,
        latestCheckStatus: latestCheck?.status ?? null,
        latestCheckAt: latestCheck?.executedAt ? new Date(latestCheck.executedAt).toISOString() : null,
        effectiveness: {
            passRate: total > 0 ? Math.round((passes / total) * 100) : null,
            total,
            passes,
            fails,
            windowDays: EFFECTIVENESS_WINDOW_DAYS,
        },
        coverage: {
            requirementCount: links.length,
            frameworkCount: frameworks.length,
            frameworks,
        },
    };
}
