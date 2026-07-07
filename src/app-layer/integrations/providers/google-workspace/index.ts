/**
 * Google Workspace identity provider (PR-2).
 *
 * A `ScheduledCheckProvider` + `IdentitySyncProvider` over the Admin SDK
 * Directory API. Syncs the Workspace directory into
 * `ConnectedIdentityAccount` and runs the shared identity checks
 * (`google-workspace.mfa_enforced`, `.no_dormant_admins`, …).
 *
 * The `listAccounts` HTTP fetch is injectable so unit tests exercise the
 * check + sync logic without live Google credentials. The live path reads
 * a domain-wide-delegated service-account JSON (impersonating an admin) —
 * see docs; the token exchange is the one part that needs live creds to
 * validate.
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

const MAX_USERS = 5000;
const PAGE_SIZE = 200;
const DIRECTORY_BASE = 'https://admin.googleapis.com/admin/directory/v1';

interface GwsDeps {
    listAccounts?: (config: Record<string, unknown>) => Promise<NormalizedIdentityAccount[]>;
    /** Injectable token getter (defaults to a service-account JWT exchange). */
    getAccessToken?: (config: Record<string, unknown>) => Promise<string>;
    fetchImpl?: typeof fetch;
}

interface GoogleUser {
    id: string;
    primaryEmail?: string;
    name?: { fullName?: string };
    suspended?: boolean;
    archived?: boolean;
    isAdmin?: boolean;
    isDelegatedAdmin?: boolean;
    isEnrolledIn2Sv?: boolean;
    lastLoginTime?: string | null;
}

function mapGoogleStatus(u: GoogleUser): NormalizedIdentityAccount['status'] {
    if (u.archived) return 'DEPROVISIONED';
    if (u.suspended) return 'SUSPENDED';
    return 'ACTIVE';
}

function normalizeGoogleUser(u: GoogleUser): NormalizedIdentityAccount {
    return {
        externalUserId: u.id,
        email: u.primaryEmail || '',
        displayName: u.name?.fullName,
        status: mapGoogleStatus(u),
        isAdmin: Boolean(u.isAdmin || u.isDelegatedAdmin),
        mfaEnrolled: Boolean(u.isEnrolledIn2Sv),
        // Workspace accounts authenticate against Google SSO by construction;
        // treat a managed (non-suspended) account as federated.
        ssoEnrolled: true,
        groups: [],
        lastActiveAt:
            u.lastLoginTime && u.lastLoginTime !== '1970-01-01T00:00:00.000Z'
                ? new Date(u.lastLoginTime)
                : null,
    };
}

export class GoogleWorkspaceProvider implements ScheduledCheckProvider, IdentitySyncProvider {
    readonly id = 'google-workspace';
    readonly displayName = 'Google Workspace';
    readonly description =
        'Sync the Google Workspace directory and verify 2-Step Verification, dormant admins, admin count, and SSO.';
    readonly supportedChecks = [...IDENTITY_CHECKS];

    readonly configSchema: ConnectionConfigSchema = {
        configFields: [
            { key: 'domain', label: 'Primary domain', type: 'string', required: true, placeholder: 'acme.com' },
            { key: 'adminEmail', label: 'Admin to impersonate', type: 'string', required: true, placeholder: 'admin@acme.com', description: 'A super-admin the service account impersonates via domain-wide delegation.' },
            { key: 'maxAdmins', label: 'Max active admins', type: 'number', required: false, description: 'Threshold for admin_count_within_threshold (default 5).' },
            { key: 'dormantDays', label: 'Dormant admin threshold (days)', type: 'number', required: false, description: 'Admin considered dormant after this many days idle (default 90).' },
        ],
        secretFields: [
            { key: 'serviceAccountJson', label: 'Service-account JSON', type: 'string', required: true, description: 'A domain-wide-delegated service-account key (JSON).' },
        ],
    };

    private readonly deps: GwsDeps;
    constructor(deps: GwsDeps = {}) {
        this.deps = deps;
    }

    async validateConnection(
        config: Record<string, unknown>,
        secrets: Record<string, unknown>,
    ): Promise<ConnectionValidationResult> {
        if (!config.domain) return { valid: false, error: 'A primary domain is required.' };
        if (!config.adminEmail) return { valid: false, error: 'An admin email to impersonate is required.' };
        const saRaw = secrets.serviceAccountJson;
        if (!saRaw) return { valid: false, error: 'A service-account JSON key is required.' };
        try {
            const sa = typeof saRaw === 'string' ? JSON.parse(saRaw) : saRaw;
            if (!sa.client_email || !sa.private_key) {
                return { valid: false, error: 'Service-account JSON is missing client_email / private_key.' };
            }
            return { valid: true };
        } catch {
            return { valid: false, error: 'Service-account JSON is not valid JSON.' };
        }
    }

    async listAccounts(config: Record<string, unknown>): Promise<NormalizedIdentityAccount[]> {
        if (this.deps.listAccounts) return this.deps.listAccounts(config);
        return this.fetchGoogleAccounts(config);
    }

    private async fetchGoogleAccounts(config: Record<string, unknown>): Promise<NormalizedIdentityAccount[]> {
        const doFetch = this.deps.fetchImpl ?? fetch;
        const token = this.deps.getAccessToken
            ? await this.deps.getAccessToken(config)
            : await getGoogleAccessToken(config);
        const domain = String(config.domain ?? '');
        const out: NormalizedIdentityAccount[] = [];
        let pageToken: string | undefined;
        do {
            const url = new URL(`${DIRECTORY_BASE}/users`);
            url.searchParams.set('domain', domain);
            url.searchParams.set('maxResults', String(PAGE_SIZE));
            url.searchParams.set('projection', 'full');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const res = await doFetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`Google directory fetch failed (HTTP ${res.status})`);
            const body = (await res.json()) as { users?: GoogleUser[]; nextPageToken?: string };
            for (const u of body.users ?? []) out.push(normalizeGoogleUser(u));
            pageToken = body.nextPageToken;
        } while (pageToken && out.length < MAX_USERS);
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
                summary: 'Google Workspace check failed to run.',
                details: {},
                durationMs: Date.now() - start,
                errorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    mapResultToEvidence(input: CheckInput, result: CheckResult): EvidencePayload | null {
        if (result.status === 'ERROR') return null;
        return {
            title: `Google Workspace — ${input.parsed.checkType}`,
            content: result.summary,
            type: 'REPORT',
            category: `google-workspace:${input.parsed.checkType}`,
        };
    }
}

/**
 * Exchange a domain-wide-delegated service account for an access token
 * (JWT bearer grant, impersonating `adminEmail`). Isolated so the live
 * token exchange is the only part requiring real Google credentials.
 */
async function getGoogleAccessToken(config: Record<string, unknown>): Promise<string> {
    const crypto = await import('node:crypto');
    const saRaw = (config as { serviceAccountJson?: unknown }).serviceAccountJson;
    const sa = typeof saRaw === 'string' ? JSON.parse(saRaw) : (saRaw as { client_email: string; private_key: string });
    const adminEmail = String(config.adminEmail ?? '');
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
        iss: sa.client_email,
        sub: adminEmail,
        scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${b64(header)}.${b64(claim)}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key).toString('base64url');
    const assertion = `${signingInput}.${signature}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status})`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('Google token exchange returned no access_token');
    return json.access_token;
}
