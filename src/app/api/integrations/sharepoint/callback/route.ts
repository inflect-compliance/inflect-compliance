import { NextRequest, NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { resolvePublicOrigin } from '@/lib/http/request-origin';
import { getTenantCtx } from '@/app-layer/context';
import { assertCanAdmin } from '@/app-layer/policies/common';
import { completeSharePointConnect } from '@/app-layer/integrations/providers/sharepoint';
import { edgeLogger } from '@/lib/observability/edge-logger';

/**
 * SP-1 — SharePoint delegated-consent callback (tenant-agnostic).
 *
 * Microsoft redirects here after the admin consents. This is a single
 * registered redirect URI for all tenants; the IC tenant + a CSRF nonce ride
 * in the `sp_oauth_state` HttpOnly cookie (`<state>.<tenantSlug>`), and the
 * `state` query param must equal the cookie's nonce. The route re-authorises
 * via `getTenantCtx` (session + membership) + `assertCanAdmin` before creating
 * the connection — it never trusts the URL alone.
 *
 * Always redirects back to the admin integrations page (success or error in the
 * query) so the user lands somewhere sensible regardless of outcome.
 */
export const GET = withApiErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
    const origin = resolvePublicOrigin(req);
    const params = req.nextUrl.searchParams;
    const cookie = req.cookies.get('sp_oauth_state')?.value ?? '';
    const dot = cookie.indexOf('.');
    const cookieState = dot >= 0 ? cookie.slice(0, dot) : '';
    const tenantSlug = dot >= 0 ? cookie.slice(dot + 1) : '';

    const fail = (reason: string, status = 'error') => {
        edgeLogger.warn('SharePoint consent callback rejected', { component: 'sharepoint', reason });
        const url = tenantSlug
            ? new URL(`/t/${tenantSlug}/admin/integrations?sp=${status}`, origin)
            : new URL('/', origin);
        const res = NextResponse.redirect(url);
        res.cookies.delete('sp_oauth_state');
        return res;
    };

    // Microsoft surfaced a consent error (declined, etc.).
    if (params.get('error')) return fail(params.get('error') ?? 'consent_error', 'declined');

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return fail('missing_code_or_state');
    if (!cookieState || !tenantSlug) return fail('missing_state_cookie');
    if (state !== cookieState) return fail('state_mismatch');

    // Re-authorise as the tenant admin (session + membership + admin gate).
    let ctx;
    try {
        ctx = await getTenantCtx({ tenantSlug });
        assertCanAdmin(ctx);
    } catch {
        return fail('not_authorised');
    }

    const redirectUri = `${origin}/api/integrations/sharepoint/callback`;
    await completeSharePointConnect(ctx, { code, redirectUri });

    const res = NextResponse.redirect(
        new URL(`/t/${tenantSlug}/admin/integrations?sp=connected`, origin),
    );
    res.cookies.delete('sp_oauth_state');
    return res;
});
