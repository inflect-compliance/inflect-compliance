/**
 * Composite control-health verdict — ONE gate over the measured signals, so
 * "is this control healthy?" has a single answer surfaced on the detail card,
 * the control list, and the controls dashboard.
 *
 * Inputs are best-effort: the list computes the cheap, batchable signals
 * (measured pass rate + overdue + status/applicability); the detail card adds
 * open exceptions + evidence freshness. Missing signals default to
 * non-degrading, so the same function serves both without becoming two notions.
 */
export type ControlHealthVerdict =
    | 'HEALTHY'
    | 'DEGRADED'
    | 'AT_RISK'
    | 'NOT_APPLICABLE'
    | 'UNKNOWN';

export interface ControlHealthSignals {
    applicability: string;
    status: string;
    /** Measured pass rate 0–100 over the effectiveness window, or null if no runs. */
    passRate: number | null;
    /** Completed test runs in the window. */
    total: number;
    /** nextDueAt is in the past — the control's test is overdue. */
    overdue: boolean;
    /** Active/approved exceptions (an accepted gap) — degrades health. Detail-only; defaults 0. */
    openExceptions?: number;
    /** Whether the control has reasonably-recent evidence. Detail-only; defaults true (unknown ≠ bad). */
    evidenceFresh?: boolean;
}

/** Pass rate at/above this is considered operating well. */
export const HEALTH_PASS_RATE_STRONG = 90;
/** Below this the control is failing its own tests. */
export const HEALTH_PASS_RATE_WEAK = 70;

/**
 * Reduce the signals to a single verdict. The rules, most-severe first:
 *   • NOT_APPLICABLE  — scoped out; health doesn't apply.
 *   • UNKNOWN         — no operating signal yet (never tested, no evidence, not implemented).
 *   • AT_RISK         — failing (pass rate < 70) or not started.
 *   • DEGRADED        — overdue, an accepted exception, a middling pass rate (<90), or stale evidence.
 *   • HEALTHY         — implemented, passing strongly, on-schedule, no exceptions, fresh evidence.
 */
export function computeControlHealthVerdict(s: ControlHealthSignals): ControlHealthVerdict {
    if (s.applicability === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';

    const openExceptions = s.openExceptions ?? 0;
    // Evidence is a detail-only signal: an EXPLICIT `false` degrades, but an
    // absent value (the list path) is "unknown" — it neither counts as a
    // positive operating signal nor degrades.
    const evidenceFresh = s.evidenceFresh === true;
    const evidenceStale = s.evidenceFresh === false;

    // No operating signal at all: no runs, not implemented, no fresh evidence.
    const noSignal = s.total === 0 && s.status !== 'IMPLEMENTED' && !evidenceFresh;
    if (noSignal) return 'UNKNOWN';

    const failing = (s.passRate !== null && s.passRate < HEALTH_PASS_RATE_WEAK) || s.status === 'NOT_STARTED';
    if (failing) return 'AT_RISK';

    const degraded =
        s.overdue ||
        openExceptions > 0 ||
        (s.passRate !== null && s.passRate < HEALTH_PASS_RATE_STRONG) ||
        evidenceStale;
    if (degraded) return 'DEGRADED';

    return 'HEALTHY';
}

/** StatusBadge variant per verdict (kept UI-framework-agnostic as a string). */
export const CONTROL_HEALTH_VERDICT_VARIANT: Record<ControlHealthVerdict, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
    HEALTHY: 'success',
    DEGRADED: 'warning',
    AT_RISK: 'error',
    NOT_APPLICABLE: 'neutral',
    UNKNOWN: 'neutral',
};

export const CONTROL_HEALTH_VERDICTS: readonly ControlHealthVerdict[] = [
    'HEALTHY',
    'DEGRADED',
    'AT_RISK',
    'NOT_APPLICABLE',
    'UNKNOWN',
];
