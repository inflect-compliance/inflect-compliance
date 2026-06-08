/**
 * Automation analytics (Workflow Automation Epic 9).
 *
 * Aggregates AutomationExecution + AutomationRule over a window into the
 * shape the Analytics tab charts: rule counts, a daily executions series,
 * top-fired rules, SLA breaches, avg duration, and error rate.
 *
 * Executions are fetched bounded and bucketed in JS (analytics windows are
 * small and this avoids a raw date_trunc query); the cap is logged via the
 * `truncated` flag so a huge window can't silently under-count.
 */
import { RequestContext } from '../types';
import { assertCanReadAutomation } from '../automation';
import { runInTenantContext } from '@/lib/db-context';

const MAX_ROWS = 5000;

export interface AutomationAnalytics {
    totalRules: number;
    enabledRules: number;
    windowDays: number;
    executions: Array<{ date: string; succeeded: number; failed: number; skipped: number }>;
    topRules: Array<{ ruleId: string; name: string; count: number; successRate: number }>;
    slaBreaches: number;
    avgDurationMs: number;
    errorRate: number;
    totalExecutions: number;
    truncated: boolean;
}

export async function getAutomationAnalytics(
    ctx: RequestContext,
    days = 30,
): Promise<AutomationAnalytics> {
    assertCanReadAutomation(ctx);
    const windowDays = Math.min(Math.max(days, 1), 365);
    const since = new Date(Date.now() - windowDays * 86_400_000);

    return runInTenantContext(ctx, async (db) => {
        const [totalRules, enabledRules, rules, rows] = await Promise.all([
            db.automationRule.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
            db.automationRule.count({
                where: { tenantId: ctx.tenantId, deletedAt: null, status: 'ENABLED' },
            }),
            db.automationRule.findMany({
                where: { tenantId: ctx.tenantId },
                select: { id: true, name: true },
            }),
            db.automationExecution.findMany({
                where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
                select: {
                    ruleId: true,
                    status: true,
                    durationMs: true,
                    errorMessage: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: MAX_ROWS + 1,
            }),
        ]);

        const truncated = rows.length > MAX_ROWS;
        const exec = truncated ? rows.slice(0, MAX_ROWS) : rows;
        const ruleName = new Map(rules.map((r) => [r.id, r.name]));

        // Daily buckets (UTC date key).
        const byDay = new Map<string, { succeeded: number; failed: number; skipped: number }>();
        const byRule = new Map<string, { count: number; succeeded: number }>();
        let durSum = 0;
        let durCount = 0;
        let failed = 0;
        let slaBreaches = 0;

        for (const e of exec) {
            const day = e.createdAt.toISOString().slice(0, 10);
            const bucket = byDay.get(day) ?? { succeeded: 0, failed: 0, skipped: 0 };
            if (e.status === 'SUCCEEDED') bucket.succeeded++;
            else if (e.status === 'FAILED') bucket.failed++;
            else if (e.status === 'SKIPPED') bucket.skipped++;
            byDay.set(day, bucket);

            const r = byRule.get(e.ruleId) ?? { count: 0, succeeded: 0 };
            r.count++;
            if (e.status === 'SUCCEEDED') r.succeeded++;
            byRule.set(e.ruleId, r);

            if (e.durationMs != null) {
                durSum += e.durationMs;
                durCount++;
            }
            if (e.status === 'FAILED') failed++;
            if (e.errorMessage?.includes('SLA window')) slaBreaches++;
        }

        const executions = Array.from(byDay.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, v]) => ({ date, ...v }));

        const topRules = Array.from(byRule.entries())
            .map(([ruleId, v]) => ({
                ruleId,
                name: ruleName.get(ruleId) ?? '(deleted rule)',
                count: v.count,
                successRate: v.count ? Math.round((v.succeeded / v.count) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            totalRules,
            enabledRules,
            windowDays,
            executions,
            topRules,
            slaBreaches,
            avgDurationMs: durCount ? Math.round(durSum / durCount) : 0,
            errorRate: exec.length ? Math.round((failed / exec.length) * 100) : 0,
            totalExecutions: exec.length,
            truncated,
        };
    });
}
