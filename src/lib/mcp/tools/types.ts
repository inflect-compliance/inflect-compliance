/**
 * MCP read-tool contract.
 *
 * Every read tool is a THIN wrapper over an EXISTING read usecase — the same
 * usecase the REST API calls. A tool declares:
 *   - its MCP descriptor (name, description, JSON-schema for args);
 *   - a Zod `argsSchema` (validates/parses the agent's arguments);
 *   - a `resourceScope` — the API-key scope required IN ADDITION to the
 *     `mcp:read` capability gate (e.g. `risks:read`). A key scoped only to
 *     controls cannot call a risks tool;
 *   - `run(ctx, args)` — calls exactly one usecase with the tenant ctx. The
 *     usecase performs RLS (`runInTenantContext`) + its own permission check
 *     (`assertCanRead…`) internally, so the tool NEVER touches Prisma directly.
 *
 * All tools funnel through `runReadTool` (registry.ts), which enforces the
 * resource scope, validates args, runs the usecase, and audits the call. This
 * single funnel is what the `mcp-server-coverage` ratchet locks.
 */
import type { ZodType } from 'zod';

import type { RequestContext } from '@/app-layer/types';

/** The scope actions the api-key layer understands for a resource. */
export type ScopeAction = 'read' | 'write' | 'admin';

export interface McpReadTool<TArgs = unknown> {
    /** MCP tool name (snake_case, stable — agents key off it). */
    name: string;
    /** Human/agent-facing description. */
    description: string;
    /** JSON Schema (draft-07 subset) for the tool arguments. */
    inputSchema: Record<string, unknown>;
    /** Zod schema mirroring `inputSchema` — the runtime validation. */
    argsSchema: ZodType<TArgs>;
    /**
     * The resource scope the caller's API key must hold (checked via
     * `enforceApiKeyScope`) IN ADDITION to `mcp:read`. Read tools always use
     * the `read` action.
     */
    resourceScope: { resource: string; action: ScopeAction };
    /**
     * Execute the tool. MUST call exactly one existing read usecase with `ctx`;
     * the usecase owns RLS + permission enforcement. Returns the structured
     * result the agent reasons over (serialised to a JSON text block).
     */
    run: (ctx: RequestContext, args: TArgs) => Promise<unknown>;
}
