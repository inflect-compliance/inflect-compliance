/**
 * MCP propose-not-commit WRITE tools (Epic MCP Phase 3).
 *
 * These are the ONLY MCP tools that write — and they write a PENDING PROPOSAL,
 * never a real record. Each validates the proposed content against the target
 * create-schema and sanitises it (inside `createAgentProposal`), then queues an
 * `AgentProposal`. A human approves it before the real create-usecase runs.
 *
 * Gating: the `mcp:propose` capability scope (strictly more privileged than
 * `mcp:read`) PLUS the domain read scope. A read-only key cannot propose. No
 * propose tool imports a create/update/delete ENTITY usecase — it only calls
 * `createAgentProposal` (the queue). This is what the `mcp-propose-coverage`
 * ratchet locks.
 */
import { z } from 'zod';

import { enforceApiKeyScope } from '@/lib/auth/api-key-auth';
import { badRequest } from '@/lib/errors/types';
import {
    createAgentProposal,
    type AgentProposalKind,
} from '@/app-layer/usecases/agent-proposals';
import type { RequestContext } from '@/app-layer/types';

import { enforceMcpCapability } from '../auth';
import { RpcErrorCode, type McpToolDescriptor, type McpToolResult } from '../protocol';

export interface McpProposeTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    kind: AgentProposalKind;
    /** Domain read scope required in addition to the `mcp:propose` capability. */
    resourceScope: { resource: string; action: 'read' };
}

/** Args every propose tool accepts: 1–20 candidate items + an optional rationale. */
const proposeArgs = z
    .object({
        items: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
        rationale: z.string().max(4000).optional(),
    })
    .strict();

function proposeInputSchema(itemNoun: string): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            items: {
                type: 'array',
                minItems: 1,
                maxItems: 20,
                description: `The candidate ${itemNoun}(s) to propose. Each is validated against the ${itemNoun} create-schema; malformed items are rejected, never queued.`,
                items: { type: 'object' },
            },
            rationale: { type: 'string', maxLength: 4000, description: 'The agent\'s reasoning (stored encrypted, shown to the human reviewer).' },
        },
        required: ['items'],
        additionalProperties: false,
    };
}

export const PROPOSE_TOOLS: McpProposeTool[] = [
    {
        name: 'propose_risks',
        description:
            'Propose one or more candidate RISKS for human approval (NOT created). ' +
            'Each item uses the risk create shape (title required; description, ' +
            'category, impact 1-10, likelihood 1-10, …). Returns the pending ' +
            'proposal ids — a human approves them before any risk is created.',
        inputSchema: proposeInputSchema('risk'),
        kind: 'RISK',
        resourceScope: { resource: 'risks', action: 'read' },
    },
    {
        name: 'propose_controls',
        description:
            'Propose one or more candidate CONTROLS for human approval (NOT ' +
            'created). Each item uses the control create shape (name required; ' +
            'description, category, status, frequency, …). Returns pending proposal ids.',
        inputSchema: proposeInputSchema('control'),
        kind: 'CONTROL',
        resourceScope: { resource: 'controls', action: 'read' },
    },
    {
        name: 'draft_policy',
        description:
            'Draft one or more POLICIES for human approval (NOT published). Each ' +
            'item uses the policy create shape (title required; description, ' +
            'category, content markdown, …). Returns pending proposal ids.',
        inputSchema: proposeInputSchema('policy'),
        kind: 'POLICY',
        resourceScope: { resource: 'policies', action: 'read' },
    },
    {
        name: 'propose_finding',
        description:
            'Propose one or more candidate FINDINGS for human approval (NOT ' +
            'created). Each item uses the finding create shape (severity, type, ' +
            'title required; description, rootCause, …). Returns pending proposal ids.',
        inputSchema: proposeInputSchema('finding'),
        kind: 'FINDING',
        resourceScope: { resource: 'audits', action: 'read' },
    },
];

export function listProposeToolDescriptors(): McpToolDescriptor[] {
    return PROPOSE_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

export class McpProposeToolNotFoundError extends Error {
    readonly rpcCode = RpcErrorCode.MethodNotFound;
    constructor(name: string) {
        super(`Unknown MCP propose tool: ${name}`);
        this.name = 'McpProposeToolNotFoundError';
    }
}

export function isProposeTool(name: string): boolean {
    return PROPOSE_TOOLS.some((t) => t.name === name);
}

/**
 * Execute a propose tool: enforce the `mcp:propose` capability + domain scope,
 * validate args, then queue one PENDING `AgentProposal` per item via
 * `createAgentProposal` (which re-validates against the create-schema +
 * sanitises). NEVER creates the real entity. Returns the pending proposal ids.
 */
export async function runProposeTool(
    ctx: RequestContext,
    name: string,
    rawArgs: unknown,
): Promise<McpToolResult> {
    const tool = PROPOSE_TOOLS.find((t) => t.name === name);
    if (!tool) throw new McpProposeToolNotFoundError(name);

    // 1. Capability gate (strictly > mcp:read) + domain scope.
    enforceMcpCapability(ctx, 'propose');
    enforceApiKeyScope(ctx, tool.resourceScope.resource, tool.resourceScope.action);

    // 2. Validate the envelope.
    const parsed = proposeArgs.safeParse(rawArgs ?? {});
    if (!parsed.success) {
        throw badRequest(`Invalid arguments for "${name}": ${parsed.error.message}`);
    }

    // 3. Queue one proposal per item (createAgentProposal validates each item
    //    against the create-schema + sanitises + audits). Malformed → throws.
    const ids: string[] = [];
    for (const item of parsed.data.items) {
        const proposal = await createAgentProposal(ctx, {
            kind: tool.kind,
            payload: item,
            rationale: parsed.data.rationale ?? null,
        });
        ids.push(proposal.id);
    }

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(
                    {
                        proposed: ids.length,
                        kind: tool.kind,
                        proposalIds: ids,
                        status: 'PENDING',
                        message: `Proposed ${ids.length} ${tool.kind.toLowerCase()}(s), pending human approval in the tenant's agent-proposals review queue. Nothing was created.`,
                    },
                    null,
                    2,
                ),
            },
        ],
    };
}
