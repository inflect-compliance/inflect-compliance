/**
 * Automation execution usecases (Workflow Automation Epic 6).
 *
 * The GRC-critical audit trail: a paginated, PII-scrubbed history of every
 * rule firing, plus a manual re-trigger that replays a rule through the
 * dispatcher as a fresh execution.
 */
import { RequestContext } from '../types';
import {
    AutomationRuleRepository,
    AutomationExecutionRepository,
    assertCanReadAutomationHistory,
    assertCanExecuteAutomation,
} from '../automation';
import { notFound, badRequest } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { enqueue } from '../jobs/queue';
import type { AutomationExecutionStatus } from '@prisma/client';

/**
 * Payload keys never returned to the client — a defence-in-depth blocklist
 * over the snapshotted trigger payload (which is producer-shaped and could
 * carry sensitive free text). Matching is case-insensitive substring.
 */
const PII_BLOCKLIST = ['email', 'password', 'secret', 'token', 'ssn', 'apikey', 'api_key'];

function scrubPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
        const lower = k.toLowerCase();
        out[k] = PII_BLOCKLIST.some((b) => lower.includes(b)) ? '[redacted]' : v;
    }
    return out;
}

export async function listRuleExecutions(
    ctx: RequestContext,
    ruleId: string,
    opts: { limit?: number; cursor?: string; status?: AutomationExecutionStatus } = {},
) {
    assertCanReadAutomationHistory(ctx);
    return runInTenantContext(ctx, async (db) => {
        const { items, nextCursor } = await AutomationExecutionRepository.listForRulePaginated(
            db,
            ctx,
            ruleId,
            opts,
        );
        return {
            items: items.map((e) => ({
                id: e.id,
                ruleId: e.ruleId,
                triggerEvent: e.triggerEvent,
                status: e.status,
                triggeredBy: e.triggeredBy,
                durationMs: e.durationMs,
                errorMessage: e.errorMessage,
                outcome: e.outcomeJson,
                triggerPayload: scrubPayload(e.triggerPayloadJson),
                createdAt: e.createdAt,
                completedAt: e.completedAt,
            })),
            nextCursor,
        };
    });
}

/**
 * Manual re-trigger of a rule. Validates the rule is ENABLED, replays the
 * most recent execution's payload (so a configured filter behaves as it did
 * originally) through the dispatcher as a `manual` fire targeting just this
 * rule. Returns the enqueued job's correlation handle.
 */
export async function reTriggerRule(ctx: RequestContext, ruleId: string) {
    assertCanExecuteAutomation(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rule = await AutomationRuleRepository.getById(db, ctx, ruleId);
        if (!rule) throw notFound('Automation rule not found');
        if (rule.status !== 'ENABLED') {
            throw badRequest('Only ENABLED rules can be re-triggered');
        }
        const recent = await AutomationExecutionRepository.listForRule(db, ctx, ruleId, 1);
        const data = (recent[0]?.triggerPayloadJson as Record<string, unknown>) ?? {};

        const stableKey = `manual-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        await enqueue('automation-event-dispatch', {
            tenantId: ctx.tenantId,
            targetRuleId: ruleId,
            triggeredBy: 'manual',
            event: {
                event: rule.triggerEvent,
                tenantId: ctx.tenantId,
                entityType: 'ManualReplay',
                entityId: ruleId,
                actorUserId: ctx.userId,
                emittedAt: new Date().toISOString(),
                stableKey,
                data,
            },
        });
        return { enqueued: true, ruleId, stableKey };
    });
}
