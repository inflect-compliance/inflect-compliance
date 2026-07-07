/**
 * Okta identity provider (PR-2).
 *
 * A `ScheduledCheckProvider` + `IdentitySyncProvider`: syncs the Okta
 * directory into `ConnectedIdentityAccount` and runs per-account posture
 * checks (`okta.mfa_enforced`, `okta.no_dormant_admins`, …).
 *
 * The `listAccounts` HTTP fetch is injectable so unit tests exercise the
 * check + sync logic without a live Okta org.
 */
import type {
    ScheduledCheckProvider,
    ConnectionConfigSchema,
    ConnectionValidationResult,
    CheckInput,
    CheckResult,
    EvidencePayload,
} from '../../types';
import {
    runIdentityCheck,
    IDENTITY_CHECKS,
    type IdentitySyncProvider,
    type NormalizedIdentityAccount,
} from '../identity/types';

/** Max users pulled per sync — bounds a runaway directory. */
const MAX_USERS = 5000;
const PAGE_LIMIT = 200;

interface OktaDeps {
    /** Injectable directory fetch (defaults to the live Okta REST client). */
    listAccounts?: (config: Record<string, unknown>) => Promise<NormalizedIdentityAccount[]>;
    /** Injectable fetch, for validateConnection ping tests. */
    fetchImpl?: typeof fetch;
}

/** Map an Okta user status to the normalized lifecycle enum. */
function mapOktaStatus(status: string): NormalizedIdentityAccount['status'] {
    switch (status) {
        case 'SUSPENDED':
            return 'SUSPENDED';
        case 'DEPROVISIONED':
            return 'DEPROVISIONED';
        default:
            // ACTIVE, PROVISIONED, STAGED, RECOVERY, LOCKED_OUT, PASSWORD_EXPIRED
            return status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
    }
}

interface OktaUser {
    id: string;
    status: string;
    created?: string;
    lastLogin?: string | null;
    profile?: { email?: string; login?: string; displayName?: string; firstName?: string; lastName?: string };
    credentials?: { provider?: { type?: string } };
    _embedded?: { factors?: Array<{ status?: string }> };
}

function normalizeOktaUser(u: OktaUser): NormalizedIdentityAccount {
    const profile = u.profile ?? {};
    const name = profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || undefined;
    const providerType = u.credentials?.provider?.type;
    return {
        externalUserId: u.id,
        email: profile.email || profile.login || '',
        displayName: name,
        status: mapOktaStatus(u.status),
        // H2 — admin membership needs group/role enrichment that the users-list
        // endpoint does not carry. Report `null` (unknown) rather than a
        // hardcoded `false` that would make no_dormant_admins /
        // admin_count_within_threshold vacuously pass.
        isAdmin: null,
        // H2 — MFA factors are NOT returned by `/api/v1/users` (they need the
        // per-user `/factors` endpoint or an `expand`). Only report a value when
        // the payload actually includes factors; otherwise `null` (unknown) so
        // mfa_enforced is NOT_APPLICABLE instead of measuring an empty array.
        mfaEnrolled: u._embedded?.factors === undefined
            ? null
            : u._embedded.factors.some((f) => f.status === 'ACTIVE'),
        // Okta federated / social login accounts authenticate via SSO — a real
        // per-account signal from the credentials provider type.
        ssoEnrolled: providerType === 'FEDERATION' || providerType === 'SOCIAL',
        groups: [],
        lastActiveAt: u.lastLogin ? new Date(u.lastLogin) : null,
    };
}

export class OktaProvider implements ScheduledCheckProvider, IdentitySyncProvider {
    readonly id = 'okta';
    readonly displayName = 'Okta';
    readonly description =
        'Sync the Okta directory and verify MFA enrolment, dormant admins, admin count, and SSO federation.';
    readonly supportedChecks = [...IDENTITY_CHECKS];

    readonly configSchema: ConnectionConfigSchema = {
        configFields: [
            { key: 'orgUrl', label: 'Okta org URL', type: 'string', required: true, placeholder: 'https://acme.okta.com' },
            { key: 'maxAdmins', label: 'Max active admins', type: 'number', required: false, description: 'Threshold for admin_count_within_threshold (default 5).' },
            { key: 'dormantDays', label: 'Dormant admin threshold (days)', type: 'number', required: false, description: 'Admin considered dormant after this many days idle (default 90).' },
        ],
        secretFields: [
            { key: 'apiToken', label: 'API token (SSWS)', type: 'string', required: true, description: 'A read-only Okta API token.' },
        ],
    };

    private readonly deps: OktaDeps;
    constructor(deps: OktaDeps = {}) {
        this.deps = deps;
    }

    async validateConnection(
        config: Record<string, unknown>,
        secrets: Record<string, unknown>,
    ): Promise<ConnectionValidationResult> {
        const orgUrl = String(config.orgUrl ?? '').replace(/\/$/, '');
        const apiToken = String(secrets.apiToken ?? '');
        if (!orgUrl) return { valid: false, error: 'Okta org URL is required.' };
        if (!apiToken) return { valid: false, error: 'An Okta API token is required.' };
        const doFetch = this.deps.fetchImpl ?? fetch;
        try {
            const res = await doFetch(`${orgUrl}/api/v1/users?limit=1`, {
                headers: { Authorization: `SSWS ${apiToken}`, Accept: 'application/json' },
            });
            if (!res.ok) return { valid: false, error: `Okta directory ping failed (HTTP ${res.status}).` };
            return { valid: true };
        } catch (err) {
            return { valid: false, error: `Okta connection failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }

    /** Enumerate the Okta directory into normalized accounts. */
    async listAccounts(config: Record<string, unknown>): Promise<NormalizedIdentityAccount[]> {
        if (this.deps.listAccounts) return this.deps.listAccounts(config);
        return this.fetchOktaAccounts(config);
    }

    private async fetchOktaAccounts(config: Record<string, unknown>): Promise<NormalizedIdentityAccount[]> {
        const orgUrl = String(config.orgUrl ?? '').replace(/\/$/, '');
        const apiToken = String((config as { apiToken?: string }).apiToken ?? '');
        const doFetch = this.deps.fetchImpl ?? fetch;
        const out: NormalizedIdentityAccount[] = [];
        let url: string | null = `${orgUrl}/api/v1/users?limit=${PAGE_LIMIT}`;
        while (url && out.length < MAX_USERS) {
            const res: Response = await doFetch(url, {
                headers: { Authorization: `SSWS ${apiToken}`, Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`Okta users fetch failed (HTTP ${res.status})`);
            const users = (await res.json()) as OktaUser[];
            for (const u of users) out.push(normalizeOktaUser(u));
            // Okta paginates via RFC-5988 Link headers (rel="next").
            url = parseNextLink(res.headers.get('link'));
        }
        return out;
    }

    async runCheck(input: CheckInput): Promise<CheckResult> {
        const start = Date.now();
        try {
            const accounts = await this.listAccounts(input.connectionConfig);
            const result = runIdentityCheck(input.parsed.checkType, accounts, input.connectionConfig, new Date());
            return { ...result, durationMs: Date.now() - start };
        } catch (err) {
            return {
                status: 'ERROR',
                summary: 'Okta check failed to run.',
                details: {},
                durationMs: Date.now() - start,
                errorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    mapResultToEvidence(input: CheckInput, result: CheckResult): EvidencePayload | null {
        if (result.status === 'ERROR') return null;
        return {
            title: `Okta — ${input.parsed.checkType}`,
            content: result.summary,
            type: 'REPORT',
            category: `okta:${input.parsed.checkType}`,
        };
    }
}

/** Parse the rel="next" URL out of an RFC-5988 Link header. */
export function parseNextLink(header: string | null): string | null {
    if (!header) return null;
    for (const part of header.split(',')) {
        const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
        if (m) return m[1];
    }
    return null;
}
