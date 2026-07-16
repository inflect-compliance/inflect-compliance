/**
 * PR-E — TEST_PLAN pause/resume event semantics.
 *
 * The old emitter fired TEST_PLAN_RESUMED for ANY non-PAUSED target (e.g.
 * ACTIVE→ARCHIVED), which was semantically wrong. `testPlanPauseResumeAction`
 * is the corrected classifier: RESUMED only when leaving PAUSED.
 */
import { testPlanPauseResumeAction } from '@/app-layer/events/test.events';

describe('testPlanPauseResumeAction', () => {
    it('→ PAUSED is a pause, from any prior status', () => {
        expect(testPlanPauseResumeAction('ACTIVE', 'PAUSED')).toBe('TEST_PLAN_PAUSED');
        expect(testPlanPauseResumeAction('ARCHIVED', 'PAUSED')).toBe('TEST_PLAN_PAUSED');
    });

    it('PAUSED → active is a resume', () => {
        expect(testPlanPauseResumeAction('PAUSED', 'ACTIVE')).toBe('TEST_PLAN_RESUMED');
    });

    it('a non-pause/resume transition is neither (no spurious RESUMED)', () => {
        expect(testPlanPauseResumeAction('ACTIVE', 'ARCHIVED')).toBeNull();
        expect(testPlanPauseResumeAction('ARCHIVED', 'ACTIVE')).toBeNull();
        expect(testPlanPauseResumeAction('ACTIVE', 'ACTIVE')).toBeNull();
    });

    it('PAUSED → ARCHIVED still counts as a resume-out-of-pause', () => {
        // Leaving PAUSED is a resume even if the destination is ARCHIVED — the
        // plan is no longer paused, which is the automation-relevant signal.
        expect(testPlanPauseResumeAction('PAUSED', 'ARCHIVED')).toBe('TEST_PLAN_RESUMED');
    });
});
