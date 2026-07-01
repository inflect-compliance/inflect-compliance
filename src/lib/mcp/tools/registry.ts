/**
 * MCP read-tool registry + the single execution funnel.
 *
 * `runReadTool` is the ONE path every MCP tool call takes. It:
 *   1. resolves the tool by name;
 *   2. enforces the tool's RESOURCE scope on the API key
 *      (`enforceApiKeyScope`) — on top of the `mcp:read` capability gate the
 *      route already applied;
 *   3. validates the agent's arguments against the tool's Zod schema;
 *   4. runs the tool — which calls exactly one existing read usecase with the
 *      tenant ctx (the usecase owns RLS + its own permission check);
 *   5. audits the successful invocation as an `API_KEY` actor (who / which key
 *      / which tool / when).
 *
 * Because scope-enforcement + audit live HERE (not in each tool), the
 * `mcp-server-coverage` ratchet can assert the whole surface is gated by
 * checking this one funnel + that no tool imports Prisma directly.
 */
import { enforceApiKeyScope } from '@/lib/auth/api-key-auth';
import { appendAuditEntry } from '@/lib/audit';
import { badRequest } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';

import { RpcErrorCode, type McpToolDescriptor, type McpToolResult } from '../protocol';
import type { McpReadTool } from './types';
import { getCompliancePostureTool } from './get-compliance-posture';

/**
 * The registered read tools. Phase 1 ships one (the proof tool); Phase 2 adds
 * the full tenant-inspection suite to this array.
 */
// Tools are generic in their arg type; the registry stores them with the arg
// type erased to `unknown` (validation happens per-call via each tool's Zod
// `argsSchema`). The double-cast is the standard way to erase an invariant
// generic parameter without `any`.
export const READ_TOOLS = [
    getCompliancePostureTool,
] as unknown as ReadonlyArray<McpReadTool<unknown>>;

/** MCP `tools/list` descriptors. */
export function listReadToolDescriptors(): McpToolDescriptor[] {
    return READ_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
    }));
}

export class McpToolNotFoundError extends Error {
    readonly rpcCode = RpcErrorCode.MethodNotFound;
    constructor(name: string) {
        super(`Unknown MCP tool: ${name}`);
        this.name = 'McpToolNotFoundError';
    }
}

/**
 * Execute a read tool through the full scope → validate → usecase → audit
 * chain. `ctx` is the authenticated, RLS-carrying RequestContext from the
 * TenantApiKey. Throws:
 *   - `McpToolNotFoundError` for an unknown tool,
 *   - `forbidden` (via `enforceApiKeyScope`) if the key lacks the resource scope,
 *   - `badRequest` if the arguments fail validation,
 *   - whatever the underlying usecase throws (e.g. `forbidden` on permission).
 */
export async function runReadTool(
    ctx: RequestContext,
    name: string,
    rawArgs: unknown,
): Promise<McpToolResult> {
    const tool = READ_TOOLS.find((t) => t.name === name);
    if (!tool) throw new McpToolNotFoundError(name);

    // 1. Resource-scope gate (in addition to the mcp:read capability gate).
    enforceApiKeyScope(ctx, tool.resourceScope.resource, tool.resourceScope.action);

    // 2. Validate arguments.
    const parsed = tool.argsSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
        throw badRequest(`Invalid arguments for tool "${name}": ${parsed.error.message}`);
    }

    // 3. Run the usecase (RLS + permission enforced inside the usecase).
    const data = await tool.run(ctx, parsed.data);

    // 4. Audit the invocation as an API_KEY actor.
    await auditToolCall(ctx, name);

    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}

/**
 * Audit an MCP tool invocation. Attributed to the API key (M2M) — NOT a human
 * user — via `actorType: 'API_KEY'`, with the key id + tool recorded in
 * structured metadata. Best-effort: an audit-write failure must not fail the
 * tool call (the read already happened; the outer chain already RLS-scoped it).
 */
async function auditToolCall(ctx: RequestContext, tool: string): Promise<void> {
    await appendAuditEntry({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        actorType: 'API_KEY',
        entity: 'McpTool',
        entityId: tool,
        action: 'MCP_TOOL_INVOKED',
        requestId: ctx.requestId,
        detailsJson: { category: 'access', tool },
        metadataJson: { apiKeyId: ctx.apiKeyId ?? null, scopes: ctx.apiKeyScopes ?? [] },
    }).catch(() => undefined);
}
