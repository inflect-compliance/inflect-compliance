/**
 * Personnel posture checks (PR-4) — pure functions over the roster +
 * connected identity accounts. The `personnel` provider fetches the data
 * (tenant-scoped) and applies these; keeping them pure makes the join logic
 * unit-testable without a DB.
 */
import type { CheckResult } from '../../types';

export interface CheckEmployee {
    workEmail: string;
    status: string; // EmploymentStatus
    managerEmployeeId: string | null;
    startDate: Date | null;
}
export interface CheckAccount {
    email: string;
    status: string; // ConnectedAccountStatus
    provider: string;
}

export const PERSONNEL_CHECKS = ['offboarded_access_removed', 'onboarding_complete_within_sla', 'every_employee_has_manager'] as const;

const DEFAULT_ONBOARDING_SLA_DAYS = 30;

function num(config: Record<string, unknown>, key: string, fallback: number): number {
    const v = config[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
    return fallback;
}

function result(check: string, passedCount: number, failed: Array<{ ref: string; reason: string }>): CheckResult {
    return {
        status: failed.length === 0 ? 'PASSED' : 'FAILED',
        summary: failed.length === 0 ? `${passedCount} pass ${check}` : `${failed.length} fail ${check}`,
        details: { check, passed: passedCount, failed: failed.length, items: failed.slice(0, 500) },
    };
}

export function runPersonnelCheck(
    checkType: string,
    data: { employees: CheckEmployee[]; accounts: CheckAccount[] },
    config: Record<string, unknown>,
    now: Date,
): CheckResult {
    const { employees, accounts } = data;
    switch (checkType) {
        case 'offboarded_access_removed': {
            // Terminated employees whose identity account is still ACTIVE.
            const terminated = new Set(employees.filter((e) => e.status === 'TERMINATED').map((e) => e.workEmail.toLowerCase()));
            const failed = accounts
                .filter((a) => a.status === 'ACTIVE' && terminated.has(a.email.toLowerCase()))
                .map((a) => ({ ref: `${a.provider}:${a.email}`, reason: 'Active account for a terminated employee' }));
            const activeCount = accounts.filter((a) => a.status === 'ACTIVE').length;
            return result('offboarded_access_removed', activeCount - failed.length, failed);
        }
        case 'onboarding_complete_within_sla': {
            const slaDays = num(config, 'onboardingSlaDays', DEFAULT_ONBOARDING_SLA_DAYS);
            const cutoff = new Date(now.getTime() - slaDays * 24 * 60 * 60 * 1000);
            const onboarding = employees.filter((e) => e.status === 'ONBOARDING');
            const failed = onboarding
                .filter((e) => e.startDate && e.startDate < cutoff)
                .map((e) => ({ ref: e.workEmail, reason: `Onboarding > ${slaDays}d` }));
            return result('onboarding_complete_within_sla', onboarding.length - failed.length, failed);
        }
        case 'every_employee_has_manager': {
            const inScope = employees.filter((e) => e.status === 'ACTIVE' || e.status === 'ONBOARDING');
            const failed = inScope
                .filter((e) => !e.managerEmployeeId)
                .map((e) => ({ ref: e.workEmail, reason: 'No manager assigned' }));
            return result('every_employee_has_manager', inScope.length - failed.length, failed);
        }
        default:
            return { status: 'ERROR', summary: `Unknown personnel check: ${checkType}`, details: {}, errorMessage: `Unsupported ${checkType}` };
    }
}
