/**
 * Rule chain dispatch job (Automation Epic 7).
 *
 * Fires the next rule in a chain: creates a linked execution (carrying
 * `parentExecutionId` lineage), records the outcome, and — if that rule
 * itself chains onward — enqueues the next step after its delay.
 *
 * Cycle backstop: `depth` is capped (a rule mis-configured into a loop
 * despite the create-time DFS guard can't run forever). Action handlers are
 * still stubbed at the foundation level, so this records intent consistently
 * with automation-event-dispatch.
 */
import { runJob } from '@/lib/observability/job-runner';
import { prisma } from '@/lib/prisma';
import type { JobRunResult, RuleChainDispatchPayload } from './types';

const MAX_CHAIN_DEPTH = 10;

export async function runRuleChainDispatch(
    payload: RuleChainDispatchPayload,
): Promise<{ result: JobRunResult; executionId: string | null }> {
    return runJob('rule-chain-dispatch', async () => {
        const startedAt = new Date().toISOString();
        const startMs = performance.now();
        const { tenantId, ruleId, parentExecutionId, triggerEvent, data, depth } = payload;

        let executionId: string | null = null;
        let chained = false;

        if (depth <= MAX_CHAIN_DEPTH) {
            const rule = await prisma.automationRule.findFirst({
                where: { id: ruleId, tenantId, status: 'ENABLED', deletedAt: null },
            });

            if (rule) {
                const exec = await prisma.automationExecution.create({
                    data: {
                        tenantId,
                        ruleId: rule.id,
                        triggerEvent,
                        triggerPayloadJson: data as never,
                        status: 'SUCCEEDED',
                        triggeredBy: 'chain',
                        parentExecutionId,
                        outcomeJson: {
                            actionType: rule.actionType,
                            note: 'chained execution (action handlers register in a later epic)',
                            chainDepth: depth,
                        },
                        durationMs: 0,
                        startedAt: new Date(),
                        completedAt: new Date(),
                    },
                });
                executionId = exec.id;

                await prisma.automationRule.updateMany({
                    where: { id: rule.id, tenantId },
                    data: { executionCount: { increment: 1 }, lastTriggeredAt: new Date() },
                });

                // Chain onward.
                if (rule.nextRuleId) {
                    chained = true;
                    const { enqueue } = await import('./queue');
                    await enqueue(
                        'rule-chain-dispatch',
                        {
                            tenantId,
                            ruleId: rule.nextRuleId,
                            parentExecutionId: exec.id,
                            triggerEvent,
                            data,
                            depth: depth + 1,
                        },
                        rule.nextRuleDelay ? { delay: rule.nextRuleDelay * 60_000 } : undefined,
                    );
                }
            }
        }

        const result: JobRunResult = {
            jobName: 'rule-chain-dispatch',
            jobRunId: crypto.randomUUID(),
            success: true,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.round(performance.now() - startMs),
            itemsScanned: 1,
            itemsActioned: executionId ? 1 : 0,
            itemsSkipped: executionId ? 0 : 1,
            details: { ruleId, depth, chained, capped: depth > MAX_CHAIN_DEPTH },
        };
        return { result, executionId };
    });
}
