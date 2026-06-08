/**
 * Sub-flow dispatch job (Visual Rule Editor VR-7).
 *
 * When a rule's action is INVOKE_SUBFLOW, this resolves the target sub-flow
 * group's entry rule (the first ENABLED rule carrying `subFlowGroupId ===
 * targetGroupId`) and runs it as a child execution linked to the invoking
 * execution via `parentExecutionId` — so a sub-flow's runs roll up to their
 * caller in the execution history + governance graph.
 *
 * Action handlers remain stubbed at the foundation level (record intent),
 * consistent with automation-event-dispatch + rule-chain-dispatch.
 */
import { runJob } from '@/lib/observability/job-runner';
import { prisma } from '@/lib/prisma';
import type { JobRunResult, SubflowDispatchPayload } from './types';

export async function runSubflowDispatch(
    payload: SubflowDispatchPayload,
): Promise<{ result: JobRunResult; executionId: string | null }> {
    return runJob('subflow-dispatch', async () => {
        const startedAt = new Date().toISOString();
        const startMs = performance.now();
        const { tenantId, targetGroupId, parentExecutionId, triggerEvent, data } = payload;

        // Entry rule = the first ENABLED rule in the target group. A group's
        // trigger node owns this rule (priority breaks ties deterministically).
        const entry = await prisma.automationRule.findFirst({
            where: {
                tenantId,
                subFlowGroupId: targetGroupId,
                status: 'ENABLED',
                deletedAt: null,
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });

        let executionId: string | null = null;
        if (entry) {
            const exec = await prisma.automationExecution.create({
                data: {
                    tenantId,
                    ruleId: entry.id,
                    triggerEvent,
                    triggerPayloadJson: data as never,
                    status: 'SUCCEEDED',
                    triggeredBy: 'subflow',
                    parentExecutionId,
                    outcomeJson: {
                        actionType: entry.actionType,
                        note: 'sub-flow entry execution (action handlers register in a later epic)',
                        subFlowGroupId: targetGroupId,
                    },
                    durationMs: 0,
                    startedAt: new Date(),
                    completedAt: new Date(),
                },
            });
            executionId = exec.id;
            await prisma.automationRule.updateMany({
                where: { id: entry.id, tenantId },
                data: { executionCount: { increment: 1 }, lastTriggeredAt: new Date() },
            });
        }

        const result: JobRunResult = {
            jobName: 'subflow-dispatch',
            jobRunId: crypto.randomUUID(),
            success: true,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.round(performance.now() - startMs),
            itemsScanned: 1,
            itemsActioned: executionId ? 1 : 0,
            itemsSkipped: executionId ? 0 : 1,
            details: { targetGroupId, dispatched: !!entry },
        };
        return { result, executionId };
    });
}
