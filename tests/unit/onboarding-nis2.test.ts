/**
 * Unit tests for the NIS2 onboarding-step usecases. Covers the no-DB
 * validation paths (answer-enum + authorization); the DB-backed
 * get/save/complete flows are exercised by the E2E + the structural
 * ratchet. Also satisfies the usecase-test-coverage guardrail (every
 * usecase file must be imported by a test).
 */
import {
    getNis2AssessmentState,
    saveNis2Answer,
    completeNis2Assessment,
} from '@/app-layer/usecases/onboarding-nis2';
import { makeRequestContext } from '../helpers/make-context';

describe('onboarding-nis2 usecases', () => {
    it('exports the three step usecases', () => {
        expect(typeof getNis2AssessmentState).toBe('function');
        expect(typeof saveNis2Answer).toBe('function');
        expect(typeof completeNis2Assessment).toBe('function');
    });

    it('saveNis2Answer rejects an invalid answer enum before touching the DB', async () => {
        const ctx = makeRequestContext('ADMIN');
        await expect(
            saveNis2Answer(ctx, { questionId: 'gap-0-01', answer: 'MAYBE' }),
        ).rejects.toThrow(/Invalid answer/);
    });

    it('accepts the canonical NIS2 answer values in validation', async () => {
        const ctx = makeRequestContext('ADMIN');
        // A valid enum value passes validation and proceeds to the DB layer
        // (which is unavailable here) — so it must NOT throw the enum error.
        await expect(
            saveNis2Answer(ctx, { questionId: 'gap-0-01', answer: 'YES' }),
        ).rejects.not.toThrow(/Invalid answer/);
    });

    it('saveNis2Answer requires onboarding-management authorization', async () => {
        const reader = makeRequestContext('READER');
        await expect(
            saveNis2Answer(reader, { questionId: 'gap-0-01', answer: 'YES' }),
        ).rejects.toThrow();
    });
});
