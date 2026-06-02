/**
 * Unit test — resolvePublicOrigin.
 *
 * Node-runtime route handlers behind the production reverse proxy
 * (Caddy) see `req.nextUrl.origin` as the app's INTERNAL bind address
 * (`https://0.0.0.0:3000`); a browser following a redirect built from
 * it lands on an unreachable URL. `resolvePublicOrigin` reconstructs
 * the public origin from the proxy's `X-Forwarded-*` headers (the same
 * signal the Edge middleware uses), falling back to the configured
 * public URL, then the raw request origin.
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

    it('never returns the internal bind address when a forwarded host is present', () => {
        const req = makeReq(
            { 'x-forwarded-host': 'inflect.example.io' },
            'https://0.0.0.0:3000',
        );
        expect(resolvePublicOrigin(req)).not.toContain('0.0.0.0');
    });

    it('falls back to the configured public URL when no forwarded host is present', () => {
        // No X-Forwarded-Host → use NEXTAUTH_URL/AUTH_URL (the canonical
        // public URL). `.env.test` sets these to http://localhost:3000.
        // The raw (internal) request origin is the last resort only.
        const req = makeReq({}, 'https://0.0.0.0:3000');
        const result = resolvePublicOrigin(req);
        expect(result).not.toContain('0.0.0.0');
        expect(result).toBe('http://localhost:3000');
    });
});
