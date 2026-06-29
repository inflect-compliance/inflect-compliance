/**
 * NIS2 Article 23 notification-deadline arithmetic + the seven-phase
 * incident flow ordering. Pure functions — no I/O — so the usecase, the
 * deadline-clock job, and the tests all derive deadlines identically.
 *
 * Article 23 timeline (the regulatory teeth):
 *   - early warning  → within 24 hours of becoming aware
 *   - detailed report → within 72 hours
 *   - final report   → within 1 month
 *
 * Methodology adapted (CC BY 4.0) from Kshreenath/NIS2-Checklist —
 * Paolo Carner / BARE Consulting. NOT legal advice: the offsets are an
 * operational aid; the tenant's DPO/legal owns the actual obligation.
 */
import type {
    IncidentNotificationKind,
    IncidentPhase,
    IncidentSeverity,
} from '@prisma/client';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Add `months` calendar months to a date (clamping day-of-month for
 * short months — 31 Jan + 1 month → 28/29 Feb, matching how a human
 * reads "within one month").
 */
export function addMonths(from: Date, months: number): Date {
    const d = new Date(from.getTime());
    const targetMonth = d.getUTCMonth() + months;
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(targetMonth);
    const lastDayOfTargetMonth = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, lastDayOfTargetMonth));
    return d;
}

/**
 * The deadline for one notification kind, derived from `detectedAt`.
 */
export function deadlineFor(detectedAt: Date, kind: IncidentNotificationKind): Date {
    switch (kind) {
        case 'EARLY_WARNING_24H':
            return new Date(detectedAt.getTime() + 24 * HOUR_MS);
        case 'DETAILED_72H':
            return new Date(detectedAt.getTime() + 72 * HOUR_MS);
        case 'FINAL_1MONTH':
            return addMonths(detectedAt, 1);
    }
}

export const NOTIFICATION_KINDS: readonly IncidentNotificationKind[] = [
    'EARLY_WARNING_24H',
    'DETAILED_72H',
    'FINAL_1MONTH',
];

/**
 * The three Article 23 deadlines for an incident, derived from
 * `detectedAt`. Always returns exactly three rows.
 */
export function computeDeadlines(
    detectedAt: Date,
): ReadonlyArray<{ kind: IncidentNotificationKind; dueAt: Date }> {
    return NOTIFICATION_KINDS.map((kind) => ({
        kind,
        dueAt: deadlineFor(detectedAt, kind),
    }));
}

// ─── Phase ordering ─────────────────────────────────────────────────

/** The canonical seven-phase flow (+ CLOSED terminal). */
export const PHASE_ORDER: readonly IncidentPhase[] = [
    'DETECTION',
    'CLASSIFICATION',
    'EARLY_WARNING',
    'CONTAINMENT',
    'INVESTIGATION',
    'DETAILED_REPORT',
    'RECOVERY',
    'CLOSED',
];

/** The next phase after `phase`, or null if already CLOSED. */
export function nextPhase(phase: IncidentPhase): IncidentPhase | null {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
    return PHASE_ORDER[idx + 1];
}

// ─── Reportability heuristic ────────────────────────────────────────

/**
 * Default heuristic that SUGGESTS whether NIS2 Article 23 notification
 * is required: HIGH / CRITICAL severity. This is only a starting point
 * — `markReportable` requires an explicit human decision; the tenant's
 * DPO/legal owns the actual determination. NEVER auto-assert a legal
 * reporting obligation off this function.
 */
export function suggestsReportable(severity: IncidentSeverity): boolean {
    return severity === 'HIGH' || severity === 'CRITICAL';
}
