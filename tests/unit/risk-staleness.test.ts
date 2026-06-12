/**
 * RQ2-8 — staleness detector (pure) + thin-loader suite.
 */
import {
    assessStaleness,
    describeStaleness,
    MAX_ASSESSMENT_AGE_DAYS,
    type StalenessSignals,
} from '@/lib/risk-staleness';

const NOW = new Date('2026-06-11T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const signals = (over: Partial<StalenessSignals> = {}): StalenessSignals => ({
    nextReviewAt: null,
    lastAssessedAt: null,
    lastResidualAt: null,
    latestControlTestAt: null,
    latestKriBreachAt: null,
    ...over,
});

describe('assessStaleness — the three rot classes', () => {
    it('a signal-less risk is NOT stale (coverage gap ≠ staleness)', () => {
        const v = assessStaleness(signals(), NOW);
        expect(v).toEqual({ stale: false, reasons: [], assessmentAgeDays: null });
    });

    it('overdue review flags REVIEW_OVERDUE', () => {
        const v = assessStaleness(signals({ nextReviewAt: daysAgo(3) }), NOW);
        expect(v.stale).toBe(true);
        expect(v.reasons).toEqual(['REVIEW_OVERDUE']);
    });

    it('a future review date stays fresh', () => {
        const v = assessStaleness(signals({ nextReviewAt: daysAgo(-30) }), NOW);
        expect(v.stale).toBe(false);
    });

    it('an assessment older than the age ceiling flags ASSESSMENT_AGED', () => {
        const v = assessStaleness(
            signals({ lastAssessedAt: daysAgo(MAX_ASSESSMENT_AGE_DAYS + 10) }),
            NOW,
        );
        expect(v.reasons).toEqual(['ASSESSMENT_AGED']);
        expect(v.assessmentAgeDays).toBe(MAX_ASSESSMENT_AGE_DAYS + 10);
    });

    it('a recent assessment stays fresh and reports its age', () => {
        const v = assessStaleness(signals({ lastAssessedAt: daysAgo(30) }), NOW);
        expect(v.stale).toBe(false);
        expect(v.assessmentAgeDays).toBe(30);
    });

    it('control tests newer than the residual flag CONTROLS_MOVED_SINCE', () => {
        const v = assessStaleness(
            signals({ lastResidualAt: daysAgo(60), latestControlTestAt: daysAgo(5) }),
            NOW,
        );
        expect(v.reasons).toEqual(['CONTROLS_MOVED_SINCE']);
    });

    it('control tests OLDER than the residual do not flag', () => {
        const v = assessStaleness(
            signals({ lastResidualAt: daysAgo(5), latestControlTestAt: daysAgo(60) }),
            NOW,
        );
        expect(v.stale).toBe(false);
    });

    it('an unassessed residual never flags CONTROLS_MOVED_SINCE (that is the RQ2-2 suggestion flow)', () => {
        const v = assessStaleness(
            signals({ lastResidualAt: null, latestControlTestAt: daysAgo(1) }),
            NOW,
        );
        expect(v.stale).toBe(false);
    });

    it('a KRI breach AFTER the last assessment flags SIGNAL_MOVED (RQ3-7)', () => {
        const v = assessStaleness(
            signals({ lastAssessedAt: daysAgo(30), latestKriBreachAt: daysAgo(2) }),
            NOW,
        );
        expect(v.reasons).toEqual(['SIGNAL_MOVED']);
    });

    it('a KRI breach BEFORE the last assessment does not flag (belief already caught up)', () => {
        const v = assessStaleness(
            signals({ lastAssessedAt: daysAgo(2), latestKriBreachAt: daysAgo(30) }),
            NOW,
        );
        expect(v.stale).toBe(false);
    });

    it('a KRI breach on a never-assessed risk still flags SIGNAL_MOVED', () => {
        const v = assessStaleness(
            signals({ lastAssessedAt: null, latestKriBreachAt: daysAgo(1) }),
            NOW,
        );
        expect(v.reasons).toEqual(['SIGNAL_MOVED']);
    });

    it('no KRI breach clears the signal (un-breach = no noise)', () => {
        const v = assessStaleness(
            signals({ lastAssessedAt: daysAgo(30), latestKriBreachAt: null }),
            NOW,
        );
        expect(v.stale).toBe(false);
    });

    it('reasons stack — all four', () => {
        const v = assessStaleness(
            signals({
                nextReviewAt: daysAgo(10),
                lastAssessedAt: daysAgo(400),
                lastResidualAt: daysAgo(400),
                latestControlTestAt: daysAgo(2),
                latestKriBreachAt: daysAgo(1),
            }),
            NOW,
        );
        expect(v.reasons).toEqual([
            'REVIEW_OVERDUE',
            'ASSESSMENT_AGED',
            'CONTROLS_MOVED_SINCE',
            'SIGNAL_MOVED',
        ]);
    });
});

describe('describeStaleness', () => {
    it('fresh verdicts describe to null', () => {
        expect(describeStaleness({ stale: false, reasons: [], assessmentAgeDays: 12 })).toBeNull();
    });

    it('n=1 never reads "1 days ago" (RQ3-OB-A grammar)', () => {
        const text = describeStaleness({
            stale: true,
            reasons: ['ASSESSMENT_AGED'],
            assessmentAgeDays: 1,
        });
        expect(text).toBe('last assessed 1 day ago');
    });

    it('joins reason sentences', () => {
        const text = describeStaleness({
            stale: true,
            reasons: ['REVIEW_OVERDUE', 'ASSESSMENT_AGED'],
            assessmentAgeDays: 200,
        });
        expect(text).toBe('review date has passed; last assessed 200 days ago');
    });

    it('describes the SIGNAL_MOVED reason (RQ3-7)', () => {
        const text = describeStaleness({
            stale: true,
            reasons: ['SIGNAL_MOVED'],
            assessmentAgeDays: null,
        });
        expect(text).toBe('a key risk indicator breached since the last assessment');
    });
});
