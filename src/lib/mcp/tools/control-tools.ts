/**
 * MCP read tools — controls. `list_controls` (over `listControls`, with control
 * status + task progress) and `search_controls` (over `getUnifiedSearch`,
 * surfacing the control hits — "do I have a control for X?"). RLS + permission
 * in the usecases; MCP adds the `controls:read` gate + audit.
 */
import { z } from 'zod';

import { listControls } from '@/app-layer/usecases/control/queries';
import { getUnifiedSearch } from '@/app-layer/usecases/search';
import type { RequestContext } from '@/app-layer/types';

import type { McpReadTool } from './types';

const listControlsArgs = z
    .object({
        status: z.string().optional(),
        applicability: z.string().optional(),
        ownerUserId: z.string().optional(),
        category: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
    })
    .strict();

export const listControlsTool: McpReadTool<z.infer<typeof listControlsArgs>> = {
    name: 'list_controls',
    description:
        "List the tenant's controls with implementation status, applicability, and " +
        'task progress. Filterable by status, applicability, owner, category, and ' +
        'free-text query. Bounded by `limit` (default 50). Read-only, tenant-scoped.',
    inputSchema: {
        type: 'object',
        properties: {
            status: { type: 'string', description: 'e.g. IMPLEMENTED, IMPLEMENTING, PLANNED.' },
            applicability: { type: 'string', description: 'e.g. APPLICABLE, NOT_APPLICABLE.' },
            ownerUserId: { type: 'string' },
            category: { type: 'string' },
            q: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
        additionalProperties: false,
    },
    argsSchema: listControlsArgs,
    resourceScope: { resource: 'controls', action: 'read' },
    run: async (ctx: RequestContext, args) => {
        const { limit, ...filters } = args;
        return listControls(ctx, filters as Parameters<typeof listControls>[1], { take: limit ?? 50 });
    },
};

const searchControlsArgs = z
    .object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
    })
    .strict();

export const searchControlsTool: McpReadTool<z.infer<typeof searchControlsArgs>> = {
    name: 'search_controls',
    description:
        'Search the tenant\'s controls by free text ("do I have a control for X?"). ' +
        'Returns the matching controls (code, name, status). Bounded by `limit` ' +
        '(default 10). Read-only, tenant-scoped.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', minLength: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
        additionalProperties: false,
    },
    argsSchema: searchControlsArgs,
    resourceScope: { resource: 'controls', action: 'read' },
    run: async (ctx: RequestContext, args) => {
        const results = await getUnifiedSearch(ctx, args.query, { perTypeLimit: args.limit ?? 10 });
        // Surface only the control hits — this is a control-search tool.
        const controls = results.hits.filter((h) => h.type === 'control');
        return { query: args.query, controls };
    },
};
