/**
 * Shared identity-provider primitives (PR-2).
 *
 * Okta and Google Workspace both normalize their directory into the same
 * `NormalizedIdentityAccount` shape, then run the SAME per-account checks.
 * Keeping the normalized shape + check evaluation here means a third
 * directory provider (Entra ID, JumpCloud, …) is incremental: implement
 * `listAccounts` and reuse `runIdentityCheck`.
 */
import type { CheckResult } from '../../types';

/** A directory account normalized across providers. */
export interface NormalizedIdentityAccount {
    /** Stable id in the provider directory. */
    externalUserId: string;
    email: string;
    displayName?: string;
    /** ACTIVE | SUSPENDED | DEPROVISIONED. */
    status: 'ACTIVE' | 'SUSPENDED' | 'DEPROVISIONED';
    // H2 — `null` means the provider could NOT determine this signal from the
    // data it fetched (e.g. Okta admin membership needs group/role enrichment;
    // MFA factors aren't on the users-list endpoint). A check whose entire
    // active population is `null` for its signal returns NOT_APPLICABLE rather
    // than manufacturing a false PASS from a hardcoded value.
    isAdmin: boolean | null;
    mfaEnrolled: boolean | null;
    /** Whether the account authenticates via federated SSO. `null` = unknown. */
    ssoEnrolled: boolean | null;
    /** Group / role names. */
    groups: string[];
    lastActiveAt?: Date | null;
}

/**
 * A provider that can enumerate its directory for the `identity-sync` job.
 * Concrete providers implement this alongside `ScheduledCheckProvider`.
 */
export interface IdentitySyncProvider {
    /** Enumerate every account in the connected directory. */
    listAccounts(config: Record<string, unknown>): Promise<NormalizedIdentityAccount[]>;
}

export function isIdentitySyncProvider(p: unknown): p is IdentitySyncProvider {
    return (
        typeof p === 'object' &&
        p !== null &&
        typeof (p as IdentitySyncProvider).listAccounts === 'function'
    );
}

/** Checks every identity provider supports. */
export const IDENTITY_CHECKS = [
    'mfa_enforced',
    'no_dormant_admins',
    'admin_count_within_threshold',
    'sso_enforced',
] as const;
export type IdentityCheckType = (typeof IDENTITY_CHECKS)[number];

const DEFAULT_DORMANT_DAYS = 90;
const DEFAULT_MAX_ADMINS = 5;

function numConfig(config: Record<string, unknown>, key: string, fallback: number): number {
    const v = config[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return fallback;
}

interface AccountVerdict {
    externalUserId: string;
    email: string;
    passed: boolean;
    reason?: string;
}

/**
 * Evaluate one identity check against a normalized account set.
 *
 * Every check produces per-account verdicts in `details.accounts`, plus
 * `details.passed` / `details.failed` counts. `status` is FAILED when any
 * account fails (or, for admin_count, when the count exceeds the
 * threshold). `now` is injected for deterministic tests.
 */
export function runIdentityCheck(
    checkType: string,
    accounts: NormalizedIdentityAccount[],
    config: Record<string, unknown>,
    now: Date,
): CheckResult {
    const active = accounts.filter((a) => a.status === 'ACTIVE');

    switch (checkType) {
        case 'mfa_enforced': {
            // H2 — only judge accounts whose MFA signal is KNOWN. If none are
            // known (provider doesn't expose it), summarize → NOT_APPLICABLE.
            const known = active.filter((a) => a.mfaEnrolled !== null);
            const verdicts: AccountVerdict[] = known.map((a) => ({
                externalUserId: a.externalUserId,
                email: a.email,
                passed: a.mfaEnrolled === true,
                reason: a.mfaEnrolled ? undefined : 'MFA not enrolled',
            }));
            return summarize('mfa_enforced', verdicts);
        }
        case 'sso_enforced': {
            const known = active.filter((a) => a.ssoEnrolled !== null);
            const verdicts: AccountVerdict[] = known.map((a) => ({
                externalUserId: a.externalUserId,
                email: a.email,
                passed: a.ssoEnrolled === true,
                reason: a.ssoEnrolled ? undefined : 'Not federated via SSO',
            }));
            return summarize('sso_enforced', verdicts);
        }
        case 'no_dormant_admins': {
            // H2 — if admin membership is unknown for the whole population, we
            // cannot identify admins: NOT_APPLICABLE, not a vacuous pass.
            if (active.every((a) => a.isAdmin === null)) {
                return { status: 'NOT_APPLICABLE', summary: 'Admin membership signal unavailable for this provider', details: { check: 'no_dormant_admins' } };
            }
            const dormantDays = numConfig(config, 'dormantDays', DEFAULT_DORMANT_DAYS);
            const cutoff = new Date(now.getTime() - dormantDays * 24 * 60 * 60 * 1000);
            const admins = active.filter((a) => a.isAdmin === true);
            const verdicts: AccountVerdict[] = admins.map((a) => {
                const dormant = !a.lastActiveAt || a.lastActiveAt < cutoff;
                return {
                    externalUserId: a.externalUserId,
                    email: a.email,
                    passed: !dormant,
                    reason: dormant ? `Admin dormant > ${dormantDays}d` : undefined,
                };
            });
            return summarize('no_dormant_admins', verdicts);
        }
        case 'admin_count_within_threshold': {
            if (active.every((a) => a.isAdmin === null)) {
                return { status: 'NOT_APPLICABLE', summary: 'Admin membership signal unavailable for this provider', details: { check: 'admin_count_within_threshold' } };
            }
            const maxAdmins = numConfig(config, 'maxAdmins', DEFAULT_MAX_ADMINS);
            const admins = active.filter((a) => a.isAdmin === true);
            const passed = admins.length <= maxAdmins;
            return {
                status: passed ? 'PASSED' : 'FAILED',
                summary: `${admins.length} active admin(s); threshold ${maxAdmins}`,
                details: {
                    adminCount: admins.length,
                    threshold: maxAdmins,
                    passed: passed ? 1 : 0,
                    failed: passed ? 0 : 1,
                    admins: admins.map((a) => ({ externalUserId: a.externalUserId, email: a.email })),
                },
            };
        }
        default:
            return {
                status: 'ERROR',
                summary: `Unknown identity check: ${checkType}`,
                details: {},
                errorMessage: `Unsupported check ${checkType}`,
            };
    }
}

function summarize(checkType: string, verdicts: AccountVerdict[]): CheckResult {
    const failed = verdicts.filter((v) => !v.passed);
    // H2 — an empty account population is NOT_APPLICABLE, never a pass: a
    // directory that returned zero accounts (or a not-yet-synced connection)
    // has earned no compliance signal.
    const status: CheckResult['status'] =
        verdicts.length === 0 ? 'NOT_APPLICABLE' : failed.length === 0 ? 'PASSED' : 'FAILED';
    return {
        status,
        summary:
            verdicts.length === 0
                ? `No accounts in scope for ${checkType}`
                : failed.length === 0
                ? `${verdicts.length} account(s) pass ${checkType}`
                : `${failed.length}/${verdicts.length} account(s) fail ${checkType}`,
        details: {
            check: checkType,
            passed: verdicts.length - failed.length,
            failed: failed.length,
            // Cap the per-account list to keep resultJson bounded.
            accounts: verdicts.slice(0, 500),
        },
    };
}
