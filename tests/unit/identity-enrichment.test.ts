/**
 * GAP-4 — real per-user identity enrichment.
 *
 * Okta: mfaEnrolled from /factors, isAdmin from /roles (the users-list
 * endpoint carries neither). Google: ssoEnrolled derived from inbound SAML
 * assignments. Once these signals are real, mfa_enforced / no_dormant_admins /
 * sso_enforced can actually FAIL instead of vacuously passing on null.
 */
import { OktaProvider } from '@/app-layer/integrations/providers/okta';
import { GoogleWorkspaceProvider } from '@/app-layer/integrations/providers/google-workspace';

type RespOpts = { ok?: boolean; status?: number; link?: string | null };
function resp(body: unknown, opts: RespOpts = {}) {
    const { ok = true, status = 200, link = null } = opts;
    return {
        ok, status,
        json: async () => body,
        headers: { get: (h: string) => (h.toLowerCase() === 'link' ? link : null) },
    } as unknown as Response;
}

describe('GAP-4 — Okta per-user enrichment', () => {
    const orgUrl = 'https://acme.okta.com';
    const cfg = { orgUrl, apiToken: 'tok' };

    function oktaFetch(factors: unknown, roles: unknown, opts: { factorsOk?: boolean } = {}): typeof fetch {
        return (jest.fn(async (url: string | URL) => {
            const u = String(url);
            if (u.includes('/api/v1/users?')) return resp([{ id: 'u1', status: 'ACTIVE', profile: { email: 'u1@acme.com' } }]);
            if (u.endsWith('/u1/factors')) return resp(factors, { ok: opts.factorsOk ?? true, status: opts.factorsOk === false ? 500 : 200 });
            if (u.endsWith('/u1/roles')) return resp(roles);
            return resp([], { ok: false, status: 404 });
        }) as unknown) as typeof fetch;
    }

    it('sets mfaEnrolled=true + isAdmin=true from active factors + assigned roles', async () => {
        const p = new OktaProvider({ fetchImpl: oktaFetch([{ status: 'ACTIVE' }], [{ type: 'SUPER_ADMIN' }]) });
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].mfaEnrolled).toBe(true);
        expect(accounts[0].isAdmin).toBe(true);
    });

    it('sets mfaEnrolled=false + isAdmin=false when there are no factors / roles', async () => {
        const p = new OktaProvider({ fetchImpl: oktaFetch([], []) });
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].mfaEnrolled).toBe(false);
        expect(accounts[0].isAdmin).toBe(false);
    });

    it('leaves signals null when enrichPerUser is disabled', async () => {
        const p = new OktaProvider({ fetchImpl: oktaFetch([{ status: 'ACTIVE' }], [{ type: 'ORG_ADMIN' }]) });
        const { accounts } = await p.listAccounts({ ...cfg, enrichPerUser: false });
        expect(accounts[0].mfaEnrolled).toBeNull();
        expect(accounts[0].isAdmin).toBeNull();
    });

    it('a per-user enrichment fetch error leaves that account null (sync survives)', async () => {
        const p = new OktaProvider({ fetchImpl: oktaFetch([{ status: 'ACTIVE' }], [], { factorsOk: false }) });
        const { accounts } = await p.listAccounts(cfg);
        // factors threw → both left at base null; the sync still returns the account
        expect(accounts).toHaveLength(1);
        expect(accounts[0].mfaEnrolled).toBeNull();
    });
});

describe('GAP-4 — Google Workspace SSO enrichment', () => {
    const cfg = { domain: 'acme.com', adminEmail: 'admin@acme.com' };

    function gwsProvider(listSsoAssignments: (token: string) => Promise<{ customerWide: boolean; hasSaml: boolean }>) {
        return new GoogleWorkspaceProvider({
            getAccessToken: async () => 'tok',
            listSsoAssignments,
            fetchImpl: (jest.fn(async () => resp({ users: [{ id: 'g1', primaryEmail: 'g1@acme.com' }] })) as unknown) as typeof fetch,
        });
    }

    it('customer-wide SAML → ssoEnrolled true (sso_enforced can PASS)', async () => {
        const p = gwsProvider(async () => ({ customerWide: true, hasSaml: true }));
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].ssoEnrolled).toBe(true);
    });

    it('no SAML assignment → ssoEnrolled false (sso_enforced FAILS)', async () => {
        const p = gwsProvider(async () => ({ customerWide: false, hasSaml: false }));
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].ssoEnrolled).toBe(false);
    });

    it('only OU/group-scoped SAML → ssoEnrolled null (NOT_APPLICABLE, not a false verdict)', async () => {
        const p = gwsProvider(async () => ({ customerWide: false, hasSaml: true }));
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].ssoEnrolled).toBeNull();
    });

    it('leaves ssoEnrolled null when the SSO scope is unauthorised (fetch throws)', async () => {
        const p = gwsProvider(async () => { throw new Error('403'); });
        const { accounts } = await p.listAccounts(cfg);
        expect(accounts[0].ssoEnrolled).toBeNull();
    });

    it('derives coverage from the live inboundSsoAssignments endpoint (real fetchSsoCoverage)', async () => {
        // No injected listSsoAssignments → exercises fetchSsoCoverage over fetchImpl.
        const fetchImpl = (jest.fn(async (url: string | URL) => {
            const u = String(url);
            if (u.includes('/admin/directory/v1/users')) return resp({ users: [{ id: 'g1', primaryEmail: 'g1@acme.com' }] });
            if (u.includes('/inboundSsoAssignments')) return resp({ inboundSsoAssignments: [{ ssoMode: 'SAML_SSO' }] });
            return resp({}, { ok: false, status: 404 });
        }) as unknown) as typeof fetch;
        const p = new GoogleWorkspaceProvider({ getAccessToken: async () => 'tok', fetchImpl });
        const { accounts } = await p.listAccounts(cfg);
        // A SAML_SSO assignment with no targetOrgUnit/targetGroup is customer-wide.
        expect(accounts[0].ssoEnrolled).toBe(true);
    });
});
