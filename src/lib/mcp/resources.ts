/**
 * MCP resources — read-only grounding context.
 *
 * Resources let an agent reference stable structure (the framework catalogue,
 * later the per-framework requirement tree) without a tool round-trip per
 * lookup. Every resource read rides the SAME chain as a tool: the `mcp:read`
 * capability gate (applied by the route), a resource scope enforced here, and
 * an existing read usecase that owns RLS + its own permission check. No
 * resource reads Prisma directly.
 *
 * Phase 1 exposes the framework catalogue. Phase 2 adds per-framework
 * requirement-tree resources.
 */
import { enforceApiKeyScope } from '@/lib/auth/api-key-auth';
import { listFrameworks } from '@/app-layer/usecases/framework';
import { badRequest } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';

import type { McpResourceDescriptor, McpResourceContents } from './protocol';

const FRAMEWORKS_URI = 'inflect://frameworks';

export function listMcpResources(): McpResourceDescriptor[] {
    return [
        {
            uri: FRAMEWORKS_URI,
            name: 'Frameworks',
            description:
                'The compliance frameworks available in this workspace (name, ' +
                'version, kind, requirement + pack counts). Grounding for reasoning ' +
                'about coverage and gaps.',
            mimeType: 'application/json',
        },
    ];
}

/**
 * Read an MCP resource. Enforces the resource scope, then delegates to an
 * existing usecase (RLS + permission inside). Throws `badRequest` for an
 * unknown uri, `forbidden` (via `enforceApiKeyScope`) for a missing scope.
 */
export async function readMcpResource(
    ctx: RequestContext,
    uri: string,
): Promise<McpResourceContents> {
    if (uri === FRAMEWORKS_URI) {
        enforceApiKeyScope(ctx, 'frameworks', 'read');
        const frameworks = await listFrameworks(ctx);
        return {
            contents: [
                {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(frameworks, null, 2),
                },
            ],
        };
    }

    throw badRequest(`Unknown MCP resource: ${uri}`);
}
