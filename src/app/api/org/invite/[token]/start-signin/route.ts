/**
 * Epic D — GET /api/org/invite/[token]/start-signin
 *
 * Sets a short-lived HttpOnly cookie carrying the org-invite token,
 * then redirects to /login. After OAuth completes, the signIn
 * callback reads the cookie and calls redeemOrgInvite to create
 * the OrgMembership.
 *
 * Mirrors `/api/invites/[token]/start-signin` for tenant invites.
 * Distinct cookie name (`inflect_org_invite_token`) so a user with
 * both tenant and org invites pending doesn't conflict.
 *
 * Cookie spec:
 *   - HttpOnly — JS cannot read it; prevents XSS exfiltration.
 *   - SameSite=Lax — survives the OAuth top-level cross-origin redirect.
 *   - Secure in production — HTTPS only.
 *   - Max-Age=600 (10 min) — the user has time to complete OAuth.
 *   - Path=/ — must be visible to the signIn callback at /api/auth/*.
 *
 * The cookie is single-use in effect (redeemOrgInvite burns the
 * token on the first call) so a leaked cookie cannot be exploited
 * after the invite is consumed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env';
import { withApiErrorHandling } from '@/lib/errors/api';

// Epic E — wrapped for x-request-id + standardized error contract.
// Mirrors the tenant invites/start-signin wrap.
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> => {
    const { token } = await ctx.params;

    const response = NextResponse.redirect(
        new URL('/login', req.nextUrl.origin),
    );

    response.cookies.set('inflect_org_invite_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: 600,
    });

    return response;
});
