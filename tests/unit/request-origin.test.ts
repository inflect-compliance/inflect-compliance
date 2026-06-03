/**
 * Unit test — resolvePublicOrigin.
 *
 * Node-runtime route handlers behind the production reverse proxy
 * (Caddy) see `req.nextUrl.origin` as the app's INTERNAL bind address
 * (`https://0.0.0.0:3000`); a browser following a redirect built from
 * it lands on an unreachable URL. `resolvePublicOrigin` reconstructs
 * the public origin from the proxy's `X-Forwarded-*` headers (the same
 * signal the Edge middleware uses).
 *
 * These tests cover the forwarded-host path — the prod-critical
 * behavior that fixes the bug, and the only branch independent of the
 * ambient `NEXTAUTH_URL` (which differs between local `.env.test`
 * = :3000 and the CI Test job = :3006; pinning the configured-URL
 * fallback to an exact value made the original test env-dependent and
 * red in CI). The configured-URL / raw-origin fallbacks are
 * intentionally not asserted to an exact value here.
 */

import { resolvePublicOrigin } from '@/lib/http/request-origin';

type Hdrs = Record<string, string>;

function makeReq(headers: Hdrs, origin = 'https://0.0.0.0:3000') {
    const lower: Hdrs = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    return {
        headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
        nextUrl: { origin },
    } as unknown as Parameters<typeof resolvePublicOrigin>[0];
}

describe('resolvePublicOrigin', () => {
    it('uses X-Forwarded-Host + X-Forwarded-Proto (the proxy signal)', () => {
        const req = makeReq({
            'x-forwarded-host': 'inflect.example.io',
            'x-forwarded-proto': 'https',
        });
        expect(resolvePublicOrigin(req)).toBe('https://inflect.example.io');
    });

    it('defaults proto to https when only the host is forwarded', () => {
        const req = makeReq({ 'x-forwarded-host': 'inflect.example.io' });
        expect(resolvePublicOrigin(req)).toBe('https://inflect.example.io');
    });

    it('takes the first entry of comma-separated forwarded headers', () => {
        const req = makeReq({
            'x-forwarded-host': 'inflect.example.io, internal-lb',
            'x-forwarded-proto': 'https, http',
        });
        expect(resolvePublicOrigin(req)).toBe('https://inflect.example.io');
    });

    it('prefers the forwarded host over everything and never returns the internal bind address', () => {
        // The whole point: even when the raw request origin is the
        // internal 0.0.0.0 bind, a forwarded host wins.
        const req = makeReq(
            { 'x-forwarded-host': 'inflect.example.io' },
            'https://0.0.0.0:3000',
        );
        const result = resolvePublicOrigin(req);
        expect(result).toBe('https://inflect.example.io');
        expect(result).not.toContain('0.0.0.0');
    });
});
