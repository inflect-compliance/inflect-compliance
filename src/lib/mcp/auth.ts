/**
 * MCP request authentication — the single entry gate for /api/mcp.
 *
 * INHERITS the existing machine-to-machine auth exactly: a Bearer TenantApiKey
 * is verified by `verifyApiKey` (the SAME function every public `/api/**` route
 * uses via `getLegacyCtx`), producing a full RLS-scoped `RequestContext`
 * (tenantId, userId = key creator, role, appPermissions derived from scopes,
 * apiKeyId, apiKeyScopes). There is NO parallel auth path — the MCP server is a
 * thin adapter over this.
 *
 * On top of key verification, MCP access requires the `mcp:read` CAPABILITY
 * scope — a key valid for the REST API cannot reach the agent surface unless it
 * was explicitly minted with `mcp:read`. Individual tools then additionally
 * enforce their RESOURCE scope (e.g. `risks:read`) + the usecase's own
 * permission check + RLS. `mcp:read` is the "may talk to MCP at all" gate;
 * resource scopes gate individual tools.
 */
import type { NextRequest } from 'next/server';

import {
    extractBearerToken,
    verifyApiKey,
    enforceApiKeyScope,
} from '@/lib/auth/api-key-auth';
import { unauthorized } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';

export interface McpAuthResult {
    ctx: RequestContext;
}

/**
 * Authenticate an MCP HTTP request. Returns the tenant-scoped RequestContext
 * on success. Throws `unauthorized` if the Bearer key is missing/invalid and
 * `forbidden` (via `enforceApiKeyScope`) if the key lacks the `mcp:read`
 * capability scope.
 */
export async function authenticateMcpRequest(
    req: NextRequest,
): Promise<McpAuthResult> {
    const token = extractBearerToken(req.headers.get('authorization'));
    if (!token) {
        throw unauthorized('MCP requires a Bearer TenantApiKey');
    }

    const clientIp =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        null;

    const result = await verifyApiKey(token, clientIp);
    if (!result.valid) {
        throw unauthorized(`API key authentication failed: ${result.reason}`);
    }

    // Capability gate: the key must carry `mcp:read` (or `mcp:*` / `*`).
    // Reuses the exact scope-grant logic the REST API uses.
    enforceApiKeyScope(result.ctx, 'mcp', 'read');

    return { ctx: result.ctx };
}
