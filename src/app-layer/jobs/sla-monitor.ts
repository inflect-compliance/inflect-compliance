/**
 * SLA monitor job (Automation Epic 5).
 *
 * Scans RUNNING automation executions whose parent rule declares an
 * `slaWindowMinutes` and whose start is older than that window. Each
 * breached execution is completed as FAILED with an `slaBreached` outcome,
 * an audit event is written, and — when the rule configures a NOTIFY_USER
 * breach action — notifications are created for the configured recipients.
 *
 * Detection + marking is the load-bearing capability; richer breach actions
 * (reassign, status change) record their intent in the outcome and are a
 * follow-up. Runs every 5 minutes (see schedules.ts).
 */
import { runJob } from '@/lib/observability/job-runner';
import { logger } from '@/lib/observability/logger';
import { prisma } from '@/lib/prisma';
import { withTenantDb } from '@/lib/db-context';
import { getPermissionsForRole } from '@/lib/permissions';
import { AutomationExecutionRepository } from '../automation';
import { logEvent } from '../events/audit';
import type { RequestContext } from '../types';
import type { JobRunResult } from './types';

function makeSystemCtx(tenantId: string): RequestContext {
    return {
        requestId: `sla-monitor-${tenantId}-${Date.now()}`,
        userId: 'system',
        tenantId,
        role: 'ADMIN',
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: false },
        appPermissions: getPermissionsForRole('ADMIN'),
    };
}

export async function runSlaMonitorJob(options?: {
    tenantId?: string;
    now?: Date;
}): Promise<{ result: JobRunResult; breachedCount: number }> {
    return runJob('sla-monitor', async () => {
        const startedAt = new Date().toISOString();
        const startMs = performance.now();
        const now = options?.now ?? new Date();

        const tenants = options?.tenantId
            ? [{ id: options.tenantId }]
            : await prisma.tenant.findMany({ select: { id: true } });

        let breached = 0;
        let errored = 0;

        for (const tenant of tenants) {
            try {
                breached += await sweepTenant(tenant.id, now);
            } catch (err) {
                errored++;
                logger.error('SLA monitor failed for tenant', {
                    component: 'sla-monitor',
                    tenantId: tenant.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        const result: JobRunResult = {
            jobName: 'sla-monitor',
            jobRunId: crypto.randomUUID(),
            success: errored === 0,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.round(performance.now() - startMs),
            itemsScanned: tenants.length,
            itemsActioned: breached,
            itemsSkipped: errored,
            details: { breached, errored },
        };
        return { result, breachedCount: breached };
    });
}

/** Returns the number of breached executions actioned for one tenant. */
export async function sweepTenant(tenantId: string, now: Date): Promise<number> {
    const ctx = makeSystemCtx(tenantId);
    return withTenantDb(tenantId, async (db) => {
        // RUNNING executions whose rule has an SLA window set.
        const running = await db.automationExecution.findMany({
            where: { tenantId, status: 'RUNNING', rule: { slaWindowMinutes: { not: null } } },
            include: { rule: true },
            take: 500,
        });

        let count = 0;
        for (const exec of running) {
            const windowMin = exec.rule.slaWindowMinutes;
            if (!windowMin) continue;
            const startedAtMs = (exec.startedAt ?? exec.createdAt).getTime();
            const deadline = startedAtMs + windowMin * 60_000;
            if (now.getTime() < deadline) continue; // not breached yet

            await AutomationExecutionRepository.recordCompletion(db, ctx, exec.id, {
                status: 'FAILED',
                outcome: {
                    slaBreached: true,
                    breachedAt: now.toISOString(),
                    slaWindowMinutes: windowMin,
                    breachAction: exec.rule.slaBreachActionType ?? null,
                },
                errorMessage: `SLA window of ${windowMin}m breached`,
            });

            await logEvent(db, ctx, {
                action: 'AUTOMATION_SLA_BREACHED',
                entityType: 'AutomationExecution',
                entityId: exec.id,
                detailsJson: {
                    ruleId: exec.ruleId,
                    slaWindowMinutes: windowMin,
                    breachAction: exec.rule.slaBreachActionType ?? null,
                },
            });

            // NOTIFY_USER breach action — create notifications for recipients.
            if (exec.rule.slaBreachActionType === 'NOTIFY_USER' && exec.rule.slaBreachConfigJson) {
                const cfg = exec.rule.slaBreachConfigJson as { userIds?: string[]; message?: string };
                const userIds = Array.isArray(cfg.userIds) ? cfg.userIds : [];
                if (userIds.length > 0) {
                    await db.notification.createMany({
                        data: userIds.map((userId) => ({
                            tenantId,
                            userId,
                            type: 'GENERAL' as const,
                            title: 'Automation SLA breached',
                            message:
                                cfg.message ??
                                `An automation rule's ${windowMin}m SLA window was breached.`,
                        })),
                    });
                }
            }
            count++;
        }
        return count;
    });
}
