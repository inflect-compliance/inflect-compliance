/**
 * Unit tests — truncated-membership behaviour of the middleware gates.
 *
 * When the JWT carries only a capped subset of a user's memberships
 * (`MAX_JWT_MEMBERSHIPS`), a slug-miss is NOT a definitive denial — the
 * slug may be a membership that did not fit. `checkTenantAccess` /
 * `checkOrgAccess` then return 'allow' and let the authoritative,
 * DB-backed server-side gate decide. These tests lock that contract.
 */
import { checkTenantAccess, checkOrgAccess } from '@/lib/auth/guard';

describe('checkTenantAccess — truncated membership list', () => {
    const member = [{ slug: 'acme' }, { slug: 'beta' }];

    it('allows a slug-hit regardless of the truncation flag', () => {
        expect(checkTenantAccess('/t/acme/dashboard', member, true)).toBe('allow');
        expect(checkTenantAccess('/t/acme/dashboard', member, false)).toBe('allow');
    });

    it('denies a slug-miss when the list is NOT truncated', () => {
        expect(checkTenantAccess('/t/zeta/dashboard', member, false)).toBe(
            'cross_tenant',
        );
    });

    it('defers a slug-miss to the server when the list IS truncated', () => {
        // zeta is not in the capped list, but the list is a subset — the
        // user may well be a member. Defer rather than deny.
        expect(checkTenantAccess('/t/zeta/dashboard', member, true)).toBe('allow');
    });

    it('treats an empty list as definitive no-access even if flagged truncated', () => {
        // A truncated list is never empty — an empty list genuinely means
        // the user holds no memberships.
        expect(checkTenantAccess('/t/acme/dashboard', [], true)).toBe(
            'no_tenant_access',
        );
    });

    it('defaults to non-truncated behaviour when the flag is omitted', () => {
        expect(checkTenantAccess('/t/zeta/dashboard', member)).toBe('cross_tenant');
    });

    it('ignores the flag for non-tenant paths', () => {
        expect(checkTenantAccess('/dashboard', member, true)).toBe('allow');
    });
});

describe('checkOrgAccess — truncated membership list', () => {
    const orgs = [{ slug: 'acme-org' }, { slug: 'beta-org' }];

    it('denies a slug-miss when the list is NOT truncated', () => {
        expect(checkOrgAccess('/org/zeta-org/portfolio', orgs, false)).toBe(
            'cross_org',
        );
    });

    it('defers a slug-miss to the server when the list IS truncated', () => {
        expect(checkOrgAccess('/org/zeta-org/portfolio', orgs, true)).toBe('allow');
    });

    it('treats an empty list as definitive no-access even if flagged truncated', () => {
        expect(checkOrgAccess('/org/acme-org/portfolio', [], true)).toBe(
            'no_org_access',
        );
    });

    it('allows a slug-hit and defaults to non-truncated when omitted', () => {
        expect(checkOrgAccess('/org/acme-org/portfolio', orgs, true)).toBe('allow');
        expect(checkOrgAccess('/org/zeta-org/portfolio', orgs)).toBe('cross_org');
    });
});
