/**
 * Unit coverage for the NIS2 gap-assessment assignment usecase surface. The
 * DB-bound flows (dispatch/submit/finalize) are exercised via integration; here
 * we lock the pure contract that the delegation model depends on.
 */
import {
    NIS2_RESPONDENT_ROLES,
    partitionByRespondent,
    dispatchAssignments,
    submitAssignmentAnswers,
    finalizeAssessment,
    getAssignmentForRespondent,
    listAssignments,
} from '@/app-layer/usecases/gap-assessment-assignment';

describe('gap-assessment-assignment usecase', () => {
    it('exposes the five NIS2 respondent roles', () => {
        expect([...NIS2_RESPONDENT_ROLES]).toEqual(['CEO', 'IT', 'HR', 'PROCUREMENT', 'ANYONE']);
    });

    it('exports the full delegation surface', () => {
        for (const fn of [
            partitionByRespondent,
            dispatchAssignments,
            submitAssignmentAnswers,
            finalizeAssessment,
            getAssignmentForRespondent,
            listAssignments,
        ]) {
            expect(typeof fn).toBe('function');
        }
    });
});
