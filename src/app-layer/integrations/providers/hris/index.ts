/**
 * HRIS provider (PR-4) — BambooHR reference implementation.
 *
 * A directory-sync provider for the personnel roster. Registered for its
 * connection config + validate UI; the `hris-sync` job calls `listEmployees`.
 * It runs no scheduled checks itself (the personnel checks route to the
 * `personnel` provider), so `supportedChecks` is empty.
 *
 * `listEmployees` is injectable so the sync is unit-tested without a live
 * BambooHR account. Structure a Gusto / Rippling / Workday provider the same
 * way.
 */
import type {
    ScheduledCheckProvider,
    ConnectionConfigSchema,
    ConnectionValidationResult,
    CheckInput,
    CheckResult,
    EvidencePayload,
} from '../../types';

/** A roster row normalized across HRIS vendors. */
export interface NormalizedEmployee {
    externalId: string;
    fullName: string;
    workEmail: string;
    /** EmploymentStatus. */
    status: 'ACTIVE' | 'ONBOARDING' | 'OFFBOARDING' | 'TERMINATED' | 'LEAVE';
    department?: string | null;
    jobTitle?: string | null;
    /** Manager's work email — resolved to managerEmployeeId during sync. */
    managerEmail?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
}

export interface HrisSyncProvider {
    listEmployees(config: Record<string, unknown>): Promise<NormalizedEmployee[]>;
}

export function isHrisSyncProvider(p: unknown): p is HrisSyncProvider {
    return typeof p === 'object' && p !== null && typeof (p as HrisSyncProvider).listEmployees === 'function';
}

const MAX_EMPLOYEES = 10000;

interface BambooDeps {
    listEmployees?: (config: Record<string, unknown>) => Promise<NormalizedEmployee[]>;
    fetchImpl?: typeof fetch;
}

/** Map a BambooHR employmentStatus / status to the normalized enum. */
function mapBambooStatus(row: { status?: string; employmentStatus?: string }): NormalizedEmployee['status'] {
    const s = (row.status || row.employmentStatus || '').toLowerCase();
    if (s.includes('terminat')) return 'TERMINATED';
    if (s.includes('leave')) return 'LEAVE';
    return 'ACTIVE';
}

export class BambooHrProvider implements ScheduledCheckProvider, HrisSyncProvider {
    readonly id = 'bamboohr';
    readonly displayName = 'BambooHR';
    readonly description = 'Sync the employee roster from BambooHR into the personnel hub.';
    readonly supportedChecks: string[] = [];

    readonly configSchema: ConnectionConfigSchema = {
        configFields: [
            { key: 'subdomain', label: 'BambooHR company subdomain', type: 'string', required: true, placeholder: 'acme' },
        ],
        secretFields: [
            { key: 'apiKey', label: 'API key', type: 'string', required: true, description: 'A read-only BambooHR API key.' },
        ],
    };

    private readonly deps: BambooDeps;
    constructor(deps: BambooDeps = {}) {
        this.deps = deps;
    }

    async validateConnection(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<ConnectionValidationResult> {
        if (!config.subdomain) return { valid: false, error: 'A BambooHR subdomain is required.' };
        if (!secrets.apiKey) return { valid: false, error: 'A BambooHR API key is required.' };
        return { valid: true };
    }

    async listEmployees(config: Record<string, unknown>): Promise<NormalizedEmployee[]> {
        if (this.deps.listEmployees) return this.deps.listEmployees(config);
        return this.fetchBambooRoster(config);
    }

    private async fetchBambooRoster(config: Record<string, unknown>): Promise<NormalizedEmployee[]> {
        const subdomain = String(config.subdomain ?? '');
        const apiKey = String((config as { apiKey?: string }).apiKey ?? '');
        const doFetch = this.deps.fetchImpl ?? fetch;
        // BambooHR: Basic auth with apiKey as username, any password.
        const auth = Buffer.from(`${apiKey}:x`).toString('base64');
        const url = `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/reports/custom?format=JSON`;
        const res = await doFetch(url, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: ['workEmail', 'firstName', 'lastName', 'status', 'department', 'jobTitle', 'supervisorEmail', 'hireDate', 'terminationDate', 'employeeNumber'] }),
        });
        if (!res.ok) throw new Error(`BambooHR roster fetch failed (HTTP ${res.status})`);
        const body = (await res.json()) as { employees?: Array<Record<string, string>> };
        const rows = body.employees ?? [];
        return rows.slice(0, MAX_EMPLOYEES).map((r) => ({
            externalId: r.employeeNumber || r.id || r.workEmail,
            fullName: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.workEmail,
            workEmail: r.workEmail || '',
            status: mapBambooStatus(r),
            department: r.department || null,
            jobTitle: r.jobTitle || null,
            managerEmail: r.supervisorEmail || null,
            startDate: r.hireDate ? new Date(r.hireDate) : null,
            endDate: r.terminationDate ? new Date(r.terminationDate) : null,
        })).filter((e) => e.workEmail);
    }

    // HRIS runs no scheduled checks — personnel checks route to the personnel provider.
    async runCheck(): Promise<CheckResult> {
        return { status: 'ERROR', summary: 'BambooHR runs no scheduled checks.', details: {}, errorMessage: 'no checks' };
    }
    mapResultToEvidence(_input: CheckInput, _result: CheckResult): EvidencePayload | null {
        return null;
    }
}
