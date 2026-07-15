/**
 * On-premises Active Directory identity provider (direct LDAPS).
 *
 * A `ScheduledCheckProvider` + `IdentitySyncProvider` that binds to a customer
 * domain controller over LDAPS and enumerates the directory into the shared
 * `NormalizedIdentityAccount` shape, so the same identity checks
 * (`active-directory.mfa_enforced`, `.no_dormant_admins`,
 * `.admin_count_within_threshold`, `.sso_enforced`) run with zero engine
 * changes.
 *
 * This is the standalone / air-gapped counterpart to the Entra ID connector:
 * hybrid estates that sync on-prem AD up to Entra via Azure AD Connect are
 * already covered through the Graph connector; this one serves estates whose AD
 * is NOT projected into Entra. It needs network reachability to the DC (public
 * LDAPS or a VPN/tunnel) and a read-only service-account bind.
 *
 * Signals honestly reported per the H2 fail-closed contract:
 *   • status   — userAccountControl ACCOUNTDISABLE bit → SUSPENDED, else ACTIVE
 *   • isAdmin  — direct memberOf ∩ the configured admin groups (real signal)
 *   • lastActiveAt — lastLogonTimestamp (Windows FILETIME)
 *   • mfaEnrolled / ssoEnrolled — `null`: on-prem AD carries no MFA or SSO
 *     federation attribute, so those checks report NOT_APPLICABLE rather than a
 *     manufactured pass.
 *
 * The LDAP client is injectable so unit tests exercise the mapping + check
 * logic without a live domain controller; `ldapts` is lazy-imported only on the
 * live path.
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
    type ListAccountsResult,
    type NormalizedIdentityAccount,
} from '../identity/types';
import { logger } from '@/lib/observability/logger';

/** Max users pulled per sync — bounds a runaway directory. */
const MAX_USERS = 5000;
/** LDAP paged-search page size. */
const PAGE_SIZE = 1000;
/** userAccountControl ACCOUNTDISABLE flag (0x0002). */
const UAC_ACCOUNTDISABLE = 0x2;
/** Default privileged groups (direct membership) treated as admin. */
const DEFAULT_ADMIN_GROUPS = 'Domain Admins,Enterprise Admins,Administrators,Schema Admins';
/** Attributes requested from each user object. */
const USER_ATTRIBUTES = [
    'objectGUID',
    'sAMAccountName',
    'userPrincipalName',
    'mail',
    'displayName',
    'userAccountControl',
    'memberOf',
    'lastLogonTimestamp',
    'distinguishedName',
];
/** The person/user object filter (excludes computer + contact objects). */
const USER_FILTER = '(&(objectCategory=person)(objectClass=user))';

/** The minimal LDAP client surface this provider uses — satisfied by ldapts' Client. */
export interface LdapClientLike {
    bind(dn: string, password: string): Promise<void>;
    search(
        baseDN: string,
        options: Record<string, unknown>,
    ): Promise<{ searchEntries: Array<Record<string, unknown>> }>;
    unbind(): Promise<void>;
}

export interface LdapClientOptions {
    url: string;
    tlsOptions?: { rejectUnauthorized?: boolean };
    timeout?: number;
    connectTimeout?: number;
}

interface AdDeps {
    /** Injectable directory fetch (defaults to the live LDAPS enumeration). */
    listAccounts?: (config: Record<string, unknown>) => Promise<NormalizedIdentityAccount[]>;
    /** Injectable LDAP client factory (defaults to a lazy-imported ldapts Client). */
    createClient?: (opts: LdapClientOptions) => LdapClientLike;
}

// ─── value coercion helpers (LDAP attributes arrive as string | string[] | Buffer) ──

function firstString(v: unknown): string | undefined {
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0) return firstString(v[0]);
    if (Buffer.isBuffer(v)) return v.toString('utf8');
    return undefined;
}

function stringArray(v: unknown): string[] {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.map((x) => firstString(x)).filter((x): x is string => !!x);
    const s = firstString(v);
    return s ? [s] : [];
}

/** Format a 16-byte AD objectGUID (mixed-endian) as a canonical GUID string. */
export function formatObjectGuid(v: unknown): string | undefined {
    let buf: Buffer | undefined;
    if (Buffer.isBuffer(v)) buf = v;
    else if (Array.isArray(v) && Buffer.isBuffer(v[0])) buf = v[0];
    else if (typeof v === 'string') buf = Buffer.from(v, 'binary');
    else if (Array.isArray(v) && typeof v[0] === 'string') buf = Buffer.from(v[0], 'binary');
    if (!buf || buf.length !== 16) return undefined;
    const h = [...buf].map((b) => b.toString(16).padStart(2, '0'));
    // AD stores the first three groups little-endian, the last two big-endian.
    return (
        h[3] + h[2] + h[1] + h[0] + '-' +
        h[5] + h[4] + '-' +
        h[7] + h[6] + '-' +
        h[8] + h[9] + '-' +
        h[10] + h[11] + h[12] + h[13] + h[14] + h[15]
    );
}

/** Convert a Windows FILETIME (100-ns ticks since 1601-01-01) to a Date. */
export function fileTimeToDate(v: unknown): Date | null {
    const s = firstString(v);
    if (!s) return null;
    let ticks: bigint;
    try {
        ticks = BigInt(s);
    } catch {
        return null;
    }
    // 0 (and the "never" sentinel) → no last-logon on record. BigInt(...) rather
    // than `n` literals so the file typechecks under the pre-ES2020 target.
    const NEVER = BigInt('0x7fffffffffffffff');
    if (ticks <= BigInt(0) || ticks === NEVER) return null;
    const ms = ticks / BigInt(10000) - BigInt('11644473600000');
    const num = Number(ms);
    if (!Number.isFinite(num)) return null;
    const d = new Date(num);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Extract the leading CN value from a distinguished name. */
export function cnOf(dn: string): string | null {
    const m = dn.match(/^CN=((?:[^,\\]|\\.)+)/i);
    return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

function normalizeAdEntry(
    entry: Record<string, unknown>,
    adminGroupsLower: Set<string>,
): NormalizedIdentityAccount {
    const sam = firstString(entry.sAMAccountName);
    const upn = firstString(entry.userPrincipalName);
    const dn = firstString(entry.distinguishedName) ?? '';
    const externalUserId = formatObjectGuid(entry.objectGUID) ?? dn ?? sam ?? '';

    const uacRaw = firstString(entry.userAccountControl);
    const uac = uacRaw ? Number.parseInt(uacRaw, 10) : NaN;
    const disabled = Number.isFinite(uac) && (uac & UAC_ACCOUNTDISABLE) !== 0;

    // Direct group membership only — memberOf does not include nested groups or
    // the primary group. isAdmin is a REAL signal (true/false), so the admin
    // checks run rather than reporting NOT_APPLICABLE.
    const groupCns = stringArray(entry.memberOf)
        .map((g) => cnOf(g))
        .filter((c): c is string => !!c);
    const isAdmin = groupCns.some((c) => adminGroupsLower.has(c.toLowerCase()));

    return {
        externalUserId,
        email: upn || firstString(entry.mail) || (sam ? sam : ''),
        displayName: firstString(entry.displayName) || sam,
        status: disabled ? 'SUSPENDED' : 'ACTIVE',
        isAdmin,
        // On-prem AD carries no MFA or per-user SSO-federation attribute — report
        // `null` (unknown) so mfa_enforced / sso_enforced are NOT_APPLICABLE
        // rather than a manufactured pass.
        mfaEnrolled: null,
        ssoEnrolled: null,
        groups: groupCns,
        lastActiveAt: fileTimeToDate(entry.lastLogonTimestamp),
    };
}

function parseAdminGroups(config: Record<string, unknown>): Set<string> {
    const raw = firstString(config.adminGroups) ?? DEFAULT_ADMIN_GROUPS;
    return new Set(
        raw
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    );
}

export class ActiveDirectoryProvider implements ScheduledCheckProvider, IdentitySyncProvider {
    readonly id = 'active-directory';
    readonly displayName = 'Active Directory (on-prem)';
    readonly description =
        'Bind to an on-premises Active Directory domain controller over LDAPS and verify dormant admins and admin count. For MFA / SSO posture on AD, use the Microsoft Entra ID connector.';
    readonly supportedChecks = [...IDENTITY_CHECKS];
    // validateConnection performs a real LDAPS bind + probe search.
    readonly liveValidation = true;
    readonly setupGuide =
        'Provide an LDAPS URL for a reachable domain controller (ldaps://dc.corp.example.com:636), the search base DN (DC=corp,DC=example,DC=com), and a read-only service-account bind DN + password. The app must be able to reach the DC over TLS (public LDAPS or a VPN/tunnel). On-prem AD exposes no MFA or SSO-federation attribute, so those two checks report Not applicable — use the Entra ID connector for MFA/SSO posture. If your AD is synced to Entra via Azure AD Connect, prefer the Entra ID connector instead.';

    readonly configSchema: ConnectionConfigSchema = {
        configFields: [
            { key: 'url', label: 'LDAPS URL', type: 'string', required: true, placeholder: 'ldaps://dc.corp.example.com:636' },
            { key: 'baseDN', label: 'Base DN', type: 'string', required: true, placeholder: 'DC=corp,DC=example,DC=com', description: 'Search base for the user enumeration.' },
            { key: 'adminGroups', label: 'Admin groups', type: 'string', required: false, description: 'Comma-separated group names treated as admin (default: Domain Admins, Enterprise Admins, Administrators, Schema Admins). Direct membership only.' },
            { key: 'maxAdmins', label: 'Max active admins', type: 'number', required: false, description: 'Threshold for admin_count_within_threshold (default 5).' },
            { key: 'dormantDays', label: 'Dormant admin threshold (days)', type: 'number', required: false, description: 'Admin considered dormant after this many days idle (default 90).' },
            { key: 'allowSelfSignedTls', label: 'Allow self-signed TLS', type: 'boolean', required: false, description: 'Skip TLS certificate verification for an internal/enterprise CA (default off — verification on).' },
        ],
        secretFields: [
            { key: 'bindDN', label: 'Bind DN (service account)', type: 'string', required: true, description: 'A read-only service account DN or userPrincipalName, e.g. CN=svc-inflect,OU=Service,DC=corp,DC=example,DC=com.' },
            { key: 'bindPassword', label: 'Bind password', type: 'string', required: true, description: 'Password for the bind service account.' },
        ],
    };

    private readonly deps: AdDeps;
    constructor(deps: AdDeps = {}) {
        this.deps = deps;
    }

    private async makeClient(config: Record<string, unknown>): Promise<LdapClientLike> {
        const url = String(config.url ?? '').trim();
        const rejectUnauthorized = !truthy(config.allowSelfSignedTls, false);
        const opts: LdapClientOptions = {
            url,
            tlsOptions: { rejectUnauthorized },
            timeout: 30_000,
            connectTimeout: 15_000,
        };
        if (this.deps.createClient) return this.deps.createClient(opts);
        return lazyLdaptsClient(opts);
    }

    async validateConnection(
        config: Record<string, unknown>,
        secrets: Record<string, unknown>,
    ): Promise<ConnectionValidationResult> {
        const url = String(config.url ?? '').trim();
        const baseDN = String(config.baseDN ?? '').trim();
        const bindDN = String(secrets.bindDN ?? '').trim();
        const bindPassword = String(secrets.bindPassword ?? '');
        if (!url) return { valid: false, error: 'An LDAPS URL is required.' };
        if (!/^ldaps:\/\//i.test(url)) return { valid: false, error: 'The URL must use ldaps:// (LDAP over TLS).' };
        if (!baseDN) return { valid: false, error: 'A base DN is required.' };
        if (!bindDN) return { valid: false, error: 'A bind DN (service account) is required.' };
        if (!bindPassword) return { valid: false, error: 'A bind password is required.' };
        const client = await this.makeClient({ ...config, ...secrets });
        try {
            await client.bind(bindDN, bindPassword);
            // Probe the base DN with a size-limited search to confirm read access.
            await client.search(baseDN, { scope: 'base', filter: '(objectClass=*)', sizeLimit: 1, attributes: ['distinguishedName'] });
            return { valid: true };
        } catch (err) {
            return { valid: false, error: `Active Directory connection failed: ${err instanceof Error ? err.message : String(err)}` };
        } finally {
            await safeUnbind(client);
        }
    }

    /** Enumerate the AD directory into normalized accounts. */
    async listAccounts(config: Record<string, unknown>): Promise<ListAccountsResult> {
        // A test/dep injection returns a bare array — treat it as complete.
        if (this.deps.listAccounts) return { accounts: await this.deps.listAccounts(config), complete: true };
        return this.fetchAdAccounts(config);
    }

    private async fetchAdAccounts(config: Record<string, unknown>): Promise<ListAccountsResult> {
        const baseDN = String(config.baseDN ?? '').trim();
        const bindDN = String((config as { bindDN?: unknown }).bindDN ?? '').trim();
        const bindPassword = String((config as { bindPassword?: unknown }).bindPassword ?? '');
        const adminGroups = parseAdminGroups(config);
        const client = await this.makeClient(config);
        try {
            await client.bind(bindDN, bindPassword);
            const { searchEntries } = await client.search(baseDN, {
                scope: 'sub',
                filter: USER_FILTER,
                attributes: USER_ATTRIBUTES,
                paged: { pageSize: PAGE_SIZE },
                sizeLimit: MAX_USERS,
            });
            const out: NormalizedIdentityAccount[] = [];
            for (const entry of searchEntries) {
                if (out.length >= MAX_USERS) break;
                const acct = normalizeAdEntry(entry, adminGroups);
                if (acct.externalUserId) out.push(acct);
            }
            // If we filled the cap the directory may have more — a KNOWN-PARTIAL
            // enumeration (H3) that must not drive deprovisioning.
            const complete = searchEntries.length < MAX_USERS;
            if (!complete) {
                logger.warn('Active Directory enumeration hit MAX_USERS cap; sync marked partial (no deprovision reconcile)', {
                    component: 'integration-active-directory',
                    cap: MAX_USERS,
                });
            }
            return { accounts: out, complete };
        } finally {
            await safeUnbind(client);
        }
    }

    async runCheck(input: CheckInput): Promise<CheckResult> {
        const start = Date.now();
        try {
            const { accounts } = await this.listAccounts(input.connectionConfig);
            const result = runIdentityCheck(input.parsed.checkType, accounts, input.connectionConfig, new Date());
            return { ...result, durationMs: Date.now() - start };
        } catch (err) {
            return {
                status: 'ERROR',
                summary: 'Active Directory check failed to run.',
                details: {},
                durationMs: Date.now() - start,
                errorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    mapResultToEvidence(input: CheckInput, result: CheckResult): EvidencePayload | null {
        if (result.status === 'ERROR') return null;
        return {
            title: `Active Directory — ${input.parsed.checkType}`,
            content: result.summary,
            type: 'REPORT',
            category: `active-directory:${input.parsed.checkType}`,
        };
    }
}

function truthy(v: unknown, dflt: boolean): boolean {
    if (v === undefined || v === null || v === '') return dflt;
    return String(v).toLowerCase() === 'true' || v === true;
}

/** Best-effort unbind that never throws (a failed unbind must not fail the sync). */
async function safeUnbind(client: LdapClientLike): Promise<void> {
    try {
        await client.unbind();
    } catch {
        /* connection already closed / never opened — ignore */
    }
}

/** Construct a real ldapts client, importing the dependency only on the live path. */
async function lazyLdaptsClient(opts: LdapClientOptions): Promise<LdapClientLike> {
    // Deferred import keeps ldapts out of the static module graph (test env +
    // bundling) — it is only pulled in when a real LDAPS enumeration runs.
    const { Client } = await import('ldapts');
    return new Client(opts) as unknown as LdapClientLike;
}
