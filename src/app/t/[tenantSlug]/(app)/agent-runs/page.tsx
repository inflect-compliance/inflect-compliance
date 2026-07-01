import { getTenantCtx } from '@/app-layer/context';
import { listWorkflowRuns } from '@/app-layer/usecases/workflow-runs';
import { listWorkflowDefinitions } from '@/lib/agentic/workflow-registry';

import { AgentRunsClient, type RunRow } from './AgentRunsClient';

/**
 * Agent runs observability (Epic Agentic 1A). Lists the tenant's agentic
 * workflow runs with live status, cost, and pending checkpoints. An operator can
 * start a workflow, watch its step timeline, resume a paused run (after acting on
 * its proposals), or abort a runaway run.
 */
export default async function AgentRunsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const runs = await listWorkflowRuns(ctx, {});

    const rows: RunRow[] = runs.map((r) => ({
        id: r.id,
        workflowKey: r.workflowKey,
        status: r.status,
        stepCount: r.stepCount,
        costTokens: r.costTokens,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        summary: r.summary,
    }));

    const workflows = listWorkflowDefinitions().map((w) => ({ key: w.key, name: w.name, description: w.description }));

    return <AgentRunsClient tenantSlug={tenantSlug} initialRuns={rows} workflows={workflows} />;
}
