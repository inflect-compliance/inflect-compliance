/**
 * MCP read tool: `get_compliance_posture`.
 *
 * The Phase-1 proof tool — a THIN wrapper over the existing
 * `getExecutiveDashboard` usecase (the same one the executive dashboard page
 * calls). It returns the tenant's high-level compliance posture: control
 * coverage/implementation %, control + risk distributions, evidence-expiry
 * pressure, and policy/task/vendor summaries.
 *
 * The wrapper does NOT touch Prisma — `getExecutiveDashboard` runs the read in
 * `runInTenantContext` (RLS) after `assertCanRead(ctx)`. The MCP layer adds the
 * `controls:read` resource-scope gate (posture is control-coverage-centric) on
 * top of the `mcp:read` capability gate, and audits the call.
 */
import { z } from 'zod';

import { getExecutiveDashboard } from '@/app-layer/usecases/dashboard';
import type { RequestContext } from '@/app-layer/types';

import type { McpReadTool } from './types';

const argsSchema = z.object({}).strict();

export const getCompliancePostureTool: McpReadTool<Record<string, never>> = {
    name: 'get_compliance_posture',
    description:
        "Get the authenticated tenant's compliance posture: control coverage " +
        'and implementation %, control/risk distributions, evidence-expiry ' +
        'pressure, and policy/task/vendor summaries. Read-only; tenant-scoped.',
    inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },
    argsSchema,
    resourceScope: { resource: 'controls', action: 'read' },
    run: async (ctx: RequestContext) => {
        return getExecutiveDashboard(ctx);
    },
};
