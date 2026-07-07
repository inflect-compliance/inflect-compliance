/**
 * PR-2 — Okta + Google Workspace identity providers: pure check logic +
 * per-provider runCheck via the injectable listAccounts seam (no live API).
 */
import {
    runIdentityCheck,
    isIdentitySyncProvider,
    type NormalizedIdentityAccount,
} from '@/app-layer/integrations/providers/identity/types';
import { OktaProvider, parseNextLink } from '@/app-layer/integrations/providers/okta';
import { GoogleWorkspaceProvider } from '@/app-layer/integrations/providers/google-workspace';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function acct(over: Partial<NormalizedIdentityAccount>): NormalizedIdentityAccount {
    return {
        externalUserId: over.externalUserId ?? 'u1',
        email: over.email ?? 'u1@acme.com',
        displayName: over.displayName,
        status: over.status ?? 'ACTIVE',
        isAdmin: over.isAdmin ?? false,
        mfaEnrolled: over.mfaEnrolled ?? true,
        ssoEnrolled: over.ssoEnrolled ?? true,
        groups: over.groups ?? [],
        lastActiveAt: 'lastActiveAt' in over ? (over.lastActiveAt ?? null) : NOW,
    };
}

describe('runIdentityCheck', () => {
    it('mfa_enforced FAILs when an active account lacks MFA, ignoring suspended', () => {
        const accounts = [
            acct({ externalUserId: 'a', mfaEnrolled: true }),
            acct({ externalUserId: 'b', mfaEnrolled: false }),
            acct({ externalUserId: 'c', mfaEnrolled: false, status: 'SUSPENDED' }),
        ];
        const r = runIdentityCheck('mfa_enforced', accounts, {}, NOW);
        expect(r.status).toBe('FAILED');
        expect(r.details.passed).toBe(1);
        expect(r.details.failed).toBe(1); // suspended account excluded
    });

    it('mfa_enforced PASSes when every active account has MFA', () => {
        const r = runIdentityCheck('mfa_enforced', [acct({ mfaEnrolled: true })], {}, NOW);
        expect(r.status).toBe('PASSED');
    });

    it('no_dormant_admins FAILs a dormant admin past the threshold', () => {
        const old = new Date(NOW.getTime() - 200 * 24 * 60 * 60 * 1000);
        const accounts = [
            acct({ externalUserId: 'admin1', isAdmin: true, lastActiveAt: old }),
            acct({ externalUserId: 'admin2', isAdmin: true, lastActiveAt: NOW }),
            acct({ externalUserId: 'user1', isAdmin: false, lastActiveAt: old }), // non-admin excluded
        ];
        const r = runIdentityCheck('no_dormant_admins', accounts, { dormantDays: 90 }, NOW);
        expect(r.status).toBe('FAILED');
        expect(r.details.failed).toBe(1);
        expect(r.details.passed).toBe(1);
    });

    it('no_dormant_admins treats a never-logged-in admin as dormant', () => {
        const r = runIdentityCheck('no_dormant_admins', [acct({ isAdmin: true, lastActiveAt: null })], {}, NOW);
        expect(r.status).toBe('FAILED');
    });

    it('admin_count_within_threshold FAILs when admins exceed the cap', () => {
        const accounts = [
            acct({ externalUserId: 'a', isAdmin: true }),
            acct({ externalUserId: 'b', isAdmin: true }),
            acct({ externalUserId: 'c', isAdmin: true }),
        ];
        const r = runIdentityCheck('admin_count_within_threshold', accounts, { maxAdmins: 2 }, NOW);
        expect(r.status).toBe('FAILED');
        expect(r.details.adminCount).toBe(3);
        expect(r.details.threshold).toBe(2);
    });

    it('admin_count_within_threshold PASSes at/under the cap', () => {
        const r = runIdentityCheck('admin_count_within_threshold', [acct({ isAdmin: true })], { maxAdmins: 5 }, NOW);
        expect(r.status).toBe('PASSED');
    });

    it('sso_enforced FAILs a non-federated active account', () => {
        const r = runIdentityCheck('sso_enforced', [acct({ ssoEnrolled: false })], {}, NOW);
        expect(r.status).toBe('FAILED');
    });

    it('an unknown check returns ERROR', () => {
        const r = runIdentityCheck('nope', [], {}, NOW);
        expect(r.status).toBe('ERROR');
    });
});

describe('OktaProvider', () => {
    const accounts = [acct({ externalUserId: 'a', mfaEnrolled: false })];
    const provider = new OktaProvider({ listAccounts: async () => accounts });

    it('is an IdentitySyncProvider', () => {
        expect(isIdentitySyncProvider(provider)).toBe(true);
        expect(provider.supportedChecks).toContain('mfa_enforced');
    });

    it('runCheck routes to the identity check and carries durationMs', async () => {
        const r = await provider.runCheck({
            automationKey: 'okta.mfa_enforced',
            parsed: { provider: 'okta', checkType: 'mfa_enforced', raw: 'okta.mfa_enforced' },
            tenantId: 't1',
            connectionConfig: {},
            triggeredBy: 'scheduled',
        });
        expect(r.status).toBe('FAILED');
        expect(typeof r.durationMs).toBe('number');
    });

    it('runCheck returns ERROR when the directory fetch throws', async () => {
        const boom = new OktaProvider({ listAccounts: async () => { throw new Error('401'); } });
        const r = await boom.runCheck({
            automationKey: 'okta.mfa_enforced',
            parsed: { provider: 'okta', checkType: 'mfa_enforced', raw: 'okta.mfa_enforced' },
            tenantId: 't1',
            connectionConfig: {},
            triggeredBy: 'scheduled',
        });
        expect(r.status).toBe('ERROR');
        expect(r.errorMessage).toContain('401');
    });

    it('validateConnection rejects missing org/token', async () => {
        expect((await provider.validateConnection({}, {})).valid).toBe(false);
        expect((await provider.validateConnection({ orgUrl: 'https://x.okta.com' }, {})).valid).toBe(false);
    });

    it('mapResultToEvidence returns null on ERROR, a REPORT otherwise', () => {
        const input = { automationKey: 'okta.mfa_enforced', parsed: { provider: 'okta', checkType: 'mfa_enforced', raw: 'okta.mfa_enforced' }, tenantId: 't', connectionConfig: {}, triggeredBy: 'scheduled' as const };
        expect(provider.mapResultToEvidence(input, { status: 'ERROR', summary: '', details: {} })).toBeNull();
        const ev = provider.mapResultToEvidence(input, { status: 'PASSED', summary: 'ok', details: {} });
        expect(ev?.type).toBe('REPORT');
    });
});

describe('parseNextLink', () => {
    it('extracts the rel="next" URL from an Okta Link header', () => {
        const header = '<https://x.okta.com/api/v1/users?after=1>; rel="next", <https://x.okta.com/api/v1/users>; rel="self"';
        expect(parseNextLink(header)).toBe('https://x.okta.com/api/v1/users?after=1');
    });
    it('returns null when there is no next link', () => {
        expect(parseNextLink(null)).toBeNull();
        expect(parseNextLink('<https://x>; rel="self"')).toBeNull();
    });
});

describe('GoogleWorkspaceProvider', () => {
    const accounts = [acct({ externalUserId: 'g1', isAdmin: true, lastActiveAt: null })];
    const provider = new GoogleWorkspaceProvider({ listAccounts: async () => accounts });

    it('runCheck evaluates no_dormant_admins from injected accounts', async () => {
        const r = await provider.runCheck({
            automationKey: 'google-workspace.no_dormant_admins',
            parsed: { provider: 'google-workspace', checkType: 'no_dormant_admins', raw: 'google-workspace.no_dormant_admins' },
            tenantId: 't1',
            connectionConfig: {},
            triggeredBy: 'scheduled',
        });
        expect(r.status).toBe('FAILED'); // never-logged-in admin
    });

    it('validateConnection rejects malformed service-account JSON', async () => {
        const bad = await provider.validateConnection({ domain: 'acme.com', adminEmail: 'a@acme.com' }, { serviceAccountJson: 'not json' });
        expect(bad.valid).toBe(false);
        const ok = await provider.validateConnection(
            { domain: 'acme.com', adminEmail: 'a@acme.com' },
            { serviceAccountJson: JSON.stringify({ client_email: 'x@y.iam', private_key: 'k' }) },
        );
        expect(ok.valid).toBe(true);
    });
});
