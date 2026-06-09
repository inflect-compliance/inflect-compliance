/* eslint-disable @typescript-eslint/no-explicit-any -- test-mock pattern. */
/**
 * SP-1 — SharePoint delegated-token lifecycle (hermetic: injected fetch + env +
 * clock). Locks the authorize URL, the code exchange, and the refresh-on-expiry
 * + persist behaviour.
 */
import {
    buildSharePointAuthorizeUrl,
    exchangeCodeForSharePointToken,
    resolveSharePointAccessToken,
    SHAREPOINT_SCOPES,
    type SharePointSecret,
} from '@/app-layer/integrations/providers/sharepoint/token';

const ENV = { clientId: 'cid', clientSecret: 'csec', tenantId: 'tid' };
const jsonRes = (body: unknown, ok = true, status = 200): Response =>
    ({ ok, status, json: async () => body }) as unknown as Response;

describe('buildSharePointAuthorizeUrl', () => {
    it('targets the tenant authorize endpoint with consent + the SP scopes', () => {
        const url = buildSharePointAuthorizeUrl({
            redirectUri: 'https://ic.example/api/integrations/sharepoint/callback',
            state: 'st8',
            env: ENV,
        });
        expect(url).toContain('login.microsoftonline.com/tid/oauth2/v2.0/authorize');
        expect(url).toContain('client_id=cid');
        expect(url).toContain('prompt=consent');
        expect(url).toContain('state=st8');
        expect(decodeURIComponent(url)).toContain('Sites.Read.All');
        expect(SHAREPOINT_SCOPES).toContain('offline_access');
    });
});

describe('exchangeCodeForSharePointToken', () => {
    it('exchanges an auth code for the token pair', async () => {
        const f = jest.fn().mockResolvedValue(
            jsonRes({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
        );
        const secret = await exchangeCodeForSharePointToken(
            { code: 'c', redirectUri: 'https://ic/cb' },
            { fetchImpl: f as any, env: ENV },
        );
        expect(secret.accessToken).toBe('AT');
        expect(secret.refreshToken).toBe('RT');
        expect(secret.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
        // authorization_code grant against the tenant token endpoint
        expect(f.mock.calls[0][0]).toContain('/tid/oauth2/v2.0/token');
        expect((f.mock.calls[0][1].body as URLSearchParams).get('grant_type')).toBe('authorization_code');
    });

    it('rejects when no refresh token comes back (offline_access missing)', async () => {
        const f = jest.fn().mockResolvedValue(jsonRes({ access_token: 'AT', expires_in: 3600 }));
        await expect(
            exchangeCodeForSharePointToken({ code: 'c', redirectUri: 'r' }, { fetchImpl: f as any, env: ENV }),
        ).rejects.toThrow(/refresh token/i);
    });

    it('throws on a non-OK token response', async () => {
        const f = jest.fn().mockResolvedValue(jsonRes({}, false, 400));
        await expect(
            exchangeCodeForSharePointToken({ code: 'c', redirectUri: 'r' }, { fetchImpl: f as any, env: ENV }),
        ).rejects.toThrow(/400/);
    });
});

describe('resolveSharePointAccessToken', () => {
    const base: SharePointSecret = { accessToken: 'AT', refreshToken: 'RT', expiresAt: 10_000 };

    it('returns the current token when it is still valid', async () => {
        const res = await resolveSharePointAccessToken(base, { now: () => 1_000_000 /* ms → 1000s < 10000 */ });
        expect(res.accessToken).toBe('AT');
        expect(res.rotated).toBeNull();
    });

    it('refreshes + persists when expired, keeping the old refresh token if not rotated', async () => {
        const persist = jest.fn().mockResolvedValue(undefined);
        const refresh = jest.fn().mockResolvedValue({ accessToken: 'AT2', expiresAt: 99_999 });
        const res = await resolveSharePointAccessToken(base, {
            now: () => 20_000_000, // 20000s ≥ expiresAt-60
            refresh,
            persist,
        });
        expect(refresh).toHaveBeenCalledWith('RT');
        expect(res.accessToken).toBe('AT2');
        expect(res.rotated).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT', expiresAt: 99_999 });
        expect(persist).toHaveBeenCalledWith(res.rotated);
    });

    it('adopts a rotated refresh token when the IdP returns one', async () => {
        const refresh = jest.fn().mockResolvedValue({ accessToken: 'AT2', refreshToken: 'RT2', expiresAt: 99_999 });
        const res = await resolveSharePointAccessToken(base, { now: () => 20_000_000, refresh });
        expect(res.rotated?.refreshToken).toBe('RT2');
    });
});
