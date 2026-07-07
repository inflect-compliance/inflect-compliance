/**
 * H1 — public-path matcher for the token/slug-authed API routes.
 *
 * These routes carry a dynamic segment mid-path, so the prefix allowlist can't
 * express them without over-exposing the tenant API. `isPublicPath` must match
 * them exactly (real auth runs in-handler) and NOT match near-misses.
 */
import { isPublicPath, PUBLIC_API_REGEXES } from '@/lib/auth/guard';

describe('isPublicPath — dynamic public API routes (H1)', () => {
    it.each([
        '/api/t/acme/devices/report',
        '/api/t/tenant-123/devices/report',
        '/api/trust/acme/access-request',
        '/api/trust/download/abcDEF123token',
    ])('matches public token/slug-authed route: %s', (p) => {
        expect(isPublicPath(p)).toBe(true);
        expect(PUBLIC_API_REGEXES.some((re) => re.test(p))).toBe(true);
    });

    it.each([
        // NOT public — would over-expose the tenant API.
        '/api/t/acme/devices',
        '/api/t/acme/devices/report/extra',
        '/api/t/acme/risks',
        '/api/t/acme/controls',
        '/api/trust/acme/documents',
        '/api/trust/download',
        '/api/trust/',
        '/api/t/acme/devices/reportx',
    ])('does NOT match non-public route: %s', (p) => {
        expect(PUBLIC_API_REGEXES.some((re) => re.test(p))).toBe(false);
    });

    it('still matches the existing prefix + exact allowlist', () => {
        expect(isPublicPath('/api/auth/session')).toBe(true);
        expect(isPublicPath('/login')).toBe(true);
        expect(isPublicPath('/favicon.ico')).toBe(true);
        // A normal tenant API route stays private.
        expect(isPublicPath('/api/t/acme/risks')).toBe(false);
    });
});
