/**
 * MCP read tool — tenant grounding. `get_tenant_context` gives an agent the
 * baseline it needs before reasoning: the tenant's entity counts + recent
 * activity (via `getDashboardData`). The installed-framework catalogue is
 * available as the `inflect://frameworks` MCP resource and via
 * `get_framework_status`.
 *
 * RLS + `assertCanRead` in the usecase; MCP adds the `controls:read` gate
 * (controls are the compliance core) + audit.
 */
import { z } from 'zod';

import { getDashboardData } from '@/app-layer/usecases/dashboard';
import type { RequestContext } from '@/app-layer/types';

import type { McpReadTool } from './types';

const args = z.object({}).strict();

export const getTenantContextTool: McpReadTool<Record<string, never>> = {
    name: 'get_tenant_context',
    description:
        'Grounding for the tenant: entity counts (assets, risks, controls, ' +
        'evidence, open tasks, findings) and recent activity — the baseline an ' +
        'agent needs before reasoning. Read-only, tenant-scoped.',
    inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },
    argsSchema: args,
    resourceScope: { resource: 'controls', action: 'read' },
    run: async (ctx: RequestContext) => {
        return getDashboardData(ctx);
    },
};
