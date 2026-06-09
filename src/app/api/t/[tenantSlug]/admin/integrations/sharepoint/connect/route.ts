import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { env } from '@/env';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { resolvePublicOrigin } from '@/lib/http/request-origin';
import { buildSharePointAuthorizeUrl } from '@/app-layer/integrations/providers/sharepoint';

/**
 * SP-1 — start the SharePoint delegated-consent flow.
 *
 * POST → returns the Entra authorize URL and sets a short-lived HttpOnly
 * `sp_oauth_state` cookie carrying `<state>.<tenantSlug>`. The browser
 * navigates to the URL; Microsoft redirects back to the tenant-agnostic
 * callback, which verifies the state cookie + creates the connection.
 *
 * Gated by `admin.manage`.
 */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string }>(
        'admin.manage',
        async (req: NextRequest, { params }, _ctx) => {
            const state = randomUUID();
            const origin = resolvePublicOrigin(req);
            const redirectUri = `${origin}/api/integrations/sharepoint/callback`;
            const authorizeUrl = buildSharePointAuthorizeUrl({ redirectUri, state });

            const res = NextResponse.json({ authorizeUrl });
            // `<state>.<tenantSlug>` — state is a UUID (no dots), so the callback
            // splits on the first dot. HttpOnly + SameSite=Lax survives the
            // top-level OAuth redirect; 10-minute lifetime.
            res.cookies.set('sp_oauth_state', `${state}.${params.tenantSlug}`, {
                httpOnly: true,
                sameSite: 'lax',
                secure: env.NODE_ENV === 'production',
                path: '/',
                maxAge: 600,
            });
            return res;
        },
    ),
);
