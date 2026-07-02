import { getTenantCtx } from '@/app-layer/context';
import { listAgentProposals } from '@/app-layer/usecases/agent-proposals';
import { ForbiddenPage } from '@/components/ForbiddenPage';

import { AgentProposalsClient, type ProposalRow } from './AgentProposalsClient';

/**
 * Agent proposals review queue (Epic MCP Phase 3). Lists the PENDING proposals
 * an external agent submitted via the MCP `propose_*` tools, for a human to
 * approve (→ the real create-usecase runs) or reject (→ nothing is created).
 * This is the human-in-the-loop gate: an agent never creates a record directly.
 */
export default async function AgentProposalsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    // Admin-gated — reached from the /admin/mcp hub; only workspace admins
    // review the propose-not-commit queue. Server-side gate (before the data
    // load) so a non-admin never triggers the fetch.
    if (!ctx.appPermissions.admin.view) {
        return (
            <ForbiddenPage
                title="MCP Access Required"
                message="You do not have permission to review agent proposals. Contact your workspace administrator to request access."
            />
        );
    }
    const proposals = await listAgentProposals(ctx, { status: 'PENDING' });

    const rows: ProposalRow[] = proposals.map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        payloadJson: p.payloadJson,
        rationale: p.rationale,
        proposedViaKeyId: p.proposedViaKeyId,
        createdAt: p.createdAt.toISOString(),
    }));

    return <AgentProposalsClient tenantSlug={tenantSlug} initialProposals={rows} />;
}
