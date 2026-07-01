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

import { extractBearerToken, verifyApiKey } from '@/lib/auth/api-key-auth';
import { unauthorized, forbidden } from '@/lib/errors/types';
import type { RequestContext } from '@/app-layer/types';

/**
 * Enforce an MCP capability scope (`mcp:read` or `mcp:propose`). Mirrors
 * `enforceApiKeyScope`'s grant logic (`*` / `mcp:*` / `mcp:<cap>`). `mcp:read`
 * is the endpoint gate; `mcp:propose` gates the propose-not-commit write tools
 * and is strictly more privileged. Throws `forbidden` when the key lacks it.
 */
export function enforceMcpCapability(ctx: RequestContext, capability: 'read' | 'propose'): void {
    const scopes = ctx.apiKeyScopes;
    // Session-auth (no api key) — MCP is API-key only, but be defensive.
    if (!scopes) return;
    if (scopes.includes('*') || scopes.includes('mcp:*') || scopes.includes(`mcp:${capability}`)) return;
    throw forbidden(`API key does not have the "mcp:${capability}" capability scope.`);
}

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

    // Capability gate: the key must carry an MCP capability — `mcp:read`
    // (read tools) or `mcp:propose` (propose tools), or `mcp:*` / `*`. Individual
    // read tools still require `mcp:read`; propose tools require `mcp:propose`.
    const scopes = result.ctx.apiKeyScopes ?? [];
    const hasMcp = scopes.includes('*') || scopes.includes('mcp:*') || scopes.includes('mcp:read') || scopes.includes('mcp:propose');
    if (!hasMcp) {
        throw forbidden('API key does not have an MCP capability scope (mcp:read / mcp:propose).');
    }

    return { ctx: result.ctx };
}
