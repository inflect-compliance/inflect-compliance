/* eslint-disable @typescript-eslint/no-explicit-any -- middleware test harness
 * mirrors the pattern in tests/unit/cors.test.ts (NextRequest fixtures + mocked
 * rate-limiters + getToken). */
/**
 * H1 — reachability through the REAL middleware with NO session cookie.
 *
 * A device agent (Bearer device token) and an anonymous Trust Center visitor
 * have no NextAuth cookie, so `getToken()` is null. Before H1 the middleware
 * returned a blanket 401 for any `/api/*` with no token — these routes never
 * reached their in-handler auth. This proves the public matcher lets them
 * through (pass-through, not 401) while a normal tenant API route stays 401.
 */
import { NextRequest } from 'next/server';

jest.mock('../../src/lib/rate-limit/authRateLimit', () => ({
    checkAuthRateLimit: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('../../src/lib/rate-limit/apiReadRateLimit', () => ({
    checkApiReadRateLimit: jest.fn().mockResolvedValue({ ok: true }),
    isApiReadRateLimited: jest.fn().mockReturnValue(false),
    extractTenantSlug: jest.fn().mockReturnValue(null),
}));
jest.mock('next-auth/jwt', () => ({
    getToken: jest.fn().mockResolvedValue(null), // no session cookie
}));

import middleware from '../../src/middleware';
import { checkApiReadRateLimit } from '../../src/lib/rate-limit/apiReadRateLimit';

function req(method: string, pathname: string, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost:3000${pathname}`, { method, headers: new Headers(headers) });
}

describe('middleware reachability — token/slug-authed public API routes (H1)', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['POST', '/api/t/acme/devices/report', { authorization: 'Bearer icdt_testtoken123456' }],
        ['POST', '/api/trust/acme/access-request', {}],
        ['GET', '/api/trust/download/sometoken123', {}],
    ])('%s %s reaches the handler (not 401) with no session cookie', async (method, path, headers) => {
        const res = await middleware(req(method, path, headers), {} as any);
        expect(res.status).not.toBe(401);
    });

    it('a normal tenant API route with no cookie is still blocked (401)', async () => {
        const res = await middleware(req('GET', '/api/t/acme/risks'), {} as any);
        expect(res.status).toBe(401);
    });

    it('the public API surfaces are edge-rate-limited before reaching the handler', async () => {
        await middleware(req('POST', '/api/trust/acme/access-request'), {} as any);
        await middleware(req('POST', '/api/t/acme/devices/report', { authorization: 'Bearer icdt_x' }), {} as any);
        // Both public surfaces consulted the edge limiter.
        const keys = (checkApiReadRateLimit as jest.Mock).mock.calls.map((c) => c[2]);
        expect(keys.some((k: string) => k.startsWith('apitrust:'))).toBe(true);
        expect(keys.some((k: string) => k.startsWith('devreport:'))).toBe(true);
    });
});
