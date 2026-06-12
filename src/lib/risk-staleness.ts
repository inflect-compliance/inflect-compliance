/**
 * RQ2-8 — assessment staleness (pure).
 *
 * A risk register rots silently: the score stays green while the
 * world underneath it moves. This module names the rot. A risk's
 * assessment is STALE when any of:
 *
 *   REVIEW_OVERDUE       — `nextReviewAt` is in the past (the
 *                          tenant's own cadence, broken);
 *   ASSESSMENT_AGED      — the last provenance event (RQ2-1) is
 *                          older than MAX_ASSESSMENT_AGE_DAYS; a
 *                          score nobody has touched in six months
 *                          is an assertion about a world that no
 *                          longer exists;
 *   CONTROLS_MOVED_SINCE — a linked control's test run completed
 *                          AFTER the last residual assessment: the
 *                          evidence changed, the conclusion didn't.
 *   SIGNAL_MOVED         — a linked Key Risk Indicator (RQ-6)
 *                          breached to a worse RAG band AFTER the
 *                          last assessment: the sensor fired and the
 *                          belief never updated. Sensors that don't
 *                          change conclusions are decoration (RQ3-7).
 *
 * Pure — no DB, no ctx. The usecase layer feeds it timestamps; the
 * detector only compares them. Risks with no signals (no events, no
 * review date, no test runs) return NOT stale: absence of data is a
 * coverage problem, not a staleness problem, and conflating them
 * would bury the actionable rot under noise.
 */

/** Six months — past this, an untouched assessment is suspect. */
import { countNoun } from '@/lib/pluralize';

export const MAX_ASSESSMENT_AGE_DAYS = 180;

export type StalenessReason =
    | 'REVIEW_OVERDUE'
    | 'ASSESSMENT_AGED'
    | 'CONTROLS_MOVED_SINCE'
    | 'SIGNAL_MOVED';

export interface StalenessSignals {
    /** The tenant-set review date on the risk (null = no cadence). */
    nextReviewAt: Date | null;
    /** Newest RiskScoreEvent.createdAt (null = pre-provenance risk). */
    lastAssessedAt: Date | null;
    /** Newest RESIDUAL-kind event (null = residual never assessed). */
    lastResidualAt: Date | null;
    /** Newest COMPLETED test run across the linked controls. */
    latestControlTestAt: Date | null;
    /**
     * RQ3-7 — newest worsening KRI breach across the linked KRIs
     * (null = no KRI has breached, or none are linked). A breach is
     * a RAG worsening crossing recorded as a KRI_THRESHOLD_BREACH
     * reading; the usecase passes the most recent such timestamp.
     */
    latestKriBreachAt: Date | null;
}

export interface StalenessVerdict {
    stale: boolean;
    reasons: StalenessReason[];
    /** Days since the last assessment event (null without events). */
    assessmentAgeDays: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function assessStaleness(
    signals: StalenessSignals,
    now: Date = new Date(),
): StalenessVerdict {
    const reasons: StalenessReason[] = [];

    if (signals.nextReviewAt !== null && signals.nextReviewAt < now) {
        reasons.push('REVIEW_OVERDUE');
    }

    let assessmentAgeDays: number | null = null;
    if (signals.lastAssessedAt !== null) {
        assessmentAgeDays = Math.floor(
            (now.getTime() - signals.lastAssessedAt.getTime()) / DAY_MS,
        );
        if (assessmentAgeDays > MAX_ASSESSMENT_AGE_DAYS) {
            reasons.push('ASSESSMENT_AGED');
        }
    }

    // Evidence moved after the conclusion: a control test completed
    // after the last residual assessment. Only meaningful when a
    // residual HAS been assessed — an unassessed residual is the
    // RQ2-2 suggestion flow's job, not staleness.
    if (
        signals.lastResidualAt !== null &&
        signals.latestControlTestAt !== null &&
        signals.latestControlTestAt > signals.lastResidualAt
    ) {
        reasons.push('CONTROLS_MOVED_SINCE');
    }

    // RQ3-7 — the sensor fired after the belief was last set. A KRI
    // breached to a worse band AFTER the most recent assessment
    // event: the indicator says the world moved, and the score
    // hasn't caught up. When the risk has never been assessed
    // (lastAssessedAt null) a fresh breach still counts — there is
    // a live worsening signal against a non-existent conclusion.
    // Un-breaching (a later GREEN reading) clears `latestKriBreachAt`
    // upstream, so re-assessing OR the signal recovering both
    // silence this reason — no noise.
    if (
        signals.latestKriBreachAt !== null &&
        (signals.lastAssessedAt === null ||
            signals.latestKriBreachAt > signals.lastAssessedAt)
    ) {
        reasons.push('SIGNAL_MOVED');
    }

    return { stale: reasons.length > 0, reasons, assessmentAgeDays };
}

/** Human one-liner per reason — shared by the widget and explainer. */
export function describeStaleness(verdict: StalenessVerdict): string | null {
    if (!verdict.stale) return null;
    const parts: string[] = [];
    for (const r of verdict.reasons) {
        if (r === 'REVIEW_OVERDUE') parts.push('review date has passed');
        if (r === 'ASSESSMENT_AGED')
            parts.push(
                `last assessed ${countNoun(verdict.assessmentAgeDays ?? 0, 'day')} ago`,
            );
        if (r === 'CONTROLS_MOVED_SINCE')
            parts.push('control test results changed since the residual was set');
        if (r === 'SIGNAL_MOVED')
            parts.push('a key risk indicator breached since the last assessment');
    }
    return parts.join('; ');
}
