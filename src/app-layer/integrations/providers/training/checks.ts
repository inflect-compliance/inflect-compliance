/**
 * Personnel training + background-check posture checks (PR-6) — pure functions
 * over training assignments + background checks. Kept pure so the pass/fail
 * logic is unit-testable without a DB; the `training` provider fetches the rows
 * (tenant-scoped) and applies these.
 */
import type { CheckResult } from '../../types';

export interface CheckAssignment {
    employeeId: string;
    employeeEmail: string;
    status: string; // TrainingStatus
    dueAt: Date | null;
    completedAt: Date | null;
    cadenceDays: number | null;
}
export interface CheckBackgroundCheck {
    employeeId: string;
    employeeEmail: string;
    status: string; // BackgroundCheckStatus
}

export const TRAINING_CHECKS = ['training_completed_annually', 'background_check_complete'] as const;

const DAY = 24 * 60 * 60 * 1000;

function summarize(check: string, passed: number, failed: Array<{ ref: string; reason: string }>): CheckResult {
    // H2 — no assignments / no background checks in scope is NOT_APPLICABLE,
    // never a pass.
    const applicable = passed + failed.length;
    return {
        status: applicable === 0 ? 'NOT_APPLICABLE' : failed.length === 0 ? 'PASSED' : 'FAILED',
        summary: applicable === 0 ? `No population in scope for ${check}` : failed.length === 0 ? `${passed} pass ${check}` : `${failed.length} fail ${check}`,
        details: { check, passed, failed: failed.length, items: failed.slice(0, 500) },
    };
}

export function runTrainingCheck(
    checkType: string,
    data: { assignments: CheckAssignment[]; backgroundChecks: CheckBackgroundCheck[] },
    now: Date,
): CheckResult {
    switch (checkType) {
        case 'training_completed_annually': {
            const failed: Array<{ ref: string; reason: string }> = [];
            let passed = 0;
            for (const a of data.assignments) {
                const isOpen = a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS';
                const overdue = a.status === 'OVERDUE' || (isOpen && a.dueAt !== null && a.dueAt < now);
                // H2 — an open assignment with NO due date can't be shown timely,
                // so it must not silently pass. Surface it as a gap.
                const noDueDate = isOpen && a.dueAt === null;
                const cadence = a.cadenceDays ?? 365;
                const stale = a.status === 'COMPLETED' && a.completedAt !== null && a.completedAt < new Date(now.getTime() - cadence * DAY);
                if (overdue) failed.push({ ref: a.employeeEmail, reason: 'Training overdue' });
                else if (noDueDate) failed.push({ ref: a.employeeEmail, reason: 'Open training assignment has no due date' });
                else if (stale) failed.push({ ref: a.employeeEmail, reason: `Training stale (> ${cadence}d)` });
                else passed += 1;
            }
            return summarize('training_completed_annually', passed, failed);
        }
        case 'background_check_complete': {
            const failed: Array<{ ref: string; reason: string }> = [];
            let passed = 0;
            for (const b of data.backgroundChecks) {
                if (b.status === 'CLEAR') passed += 1;
                else failed.push({ ref: b.employeeEmail, reason: `Background check ${b.status}` });
            }
            return summarize('background_check_complete', passed, failed);
        }
        default:
            return { status: 'ERROR', summary: `Unknown training check: ${checkType}`, details: {}, errorMessage: `Unsupported ${checkType}` };
    }
}
