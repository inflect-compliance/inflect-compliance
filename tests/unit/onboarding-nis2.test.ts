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
import { validateAuditDetailsJson } from '@/app-layer/schemas/json-columns.schemas';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

    // Regression: the answer-save audit event must carry a valid `detailsJson`.
    // It previously shipped `{ questionId, answer }` with NO `category`
    // discriminator, so the audit write 400'd ("Invalid detailsJson
    // structure") and the answer autosave failed in production.
    describe('answer-save audit detailsJson', () => {
        it('the bare {questionId, answer} shape is rejected by the audit validator', () => {
            expect(() =>
                validateAuditDetailsJson({ questionId: 'gap-0-01', answer: 'YES' }),
            ).toThrow(/Invalid detailsJson structure/);
        });

        it('the shape the usecase now emits passes the audit validator', () => {
            expect(() =>
                validateAuditDetailsJson({
                    category: 'custom',
                    event: 'nis2_assessment_answered',
                    questionId: 'gap-0-01',
                    answer: 'YES',
                }),
            ).not.toThrow();
        });

        it('saveNis2Answer logs a NIS2_ASSESSMENT_ANSWERED event WITH a category', () => {
            // Source-level guard: the usecase must build the audit detailsJson
            // with a `category` (the required discriminator). Structural so it
            // does not depend on a live DB/audit pipeline.
            const src = fs.readFileSync(
                path.resolve(__dirname, '../../src/app-layer/usecases/onboarding-nis2.ts'),
                'utf8',
            );
            const block = src.slice(src.indexOf('NIS2_ASSESSMENT_ANSWERED'));
            const detailsJson = block.slice(0, block.indexOf('});') + 3);
            expect(detailsJson).toMatch(/category:\s*['"]custom['"]/);
        });
    });
});
