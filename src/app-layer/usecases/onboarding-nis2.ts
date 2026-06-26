/**
 * NIS2 self-assessment — onboarding usecase surface.
 *
 * The CONDITIONAL onboarding step (NIS2_SELF_ASSESSMENT, shown only when
 * NIS2 is among the selected frameworks) is backed by these three
 * usecases. They sit on top of the Prompt-1 data layer
 * (`Nis2GapAssessmentRepository`): the tenant's single self-assessment is
 * resolved get-or-create, answers autosave one at a time, and completion
 * is allowed with unanswered questions (partial completion is valid).
 *
 * Authorization mirrors the rest of onboarding — `assertCanManageOnboarding`
 * (ADMIN+) at the usecase layer; the routes wrap with `withApiErrorHandling`
 * so mutations also get the mutation-tier rate limit.
 */
import { RequestContext } from '../types';
import { runInTenantContext, type PrismaTx } from '@/lib/db-context';
import { badRequest } from '@/lib/errors/types';
import { assertCanManageOnboarding } from '../policies/onboarding.policies';
import { Nis2GapAssessmentRepository } from '../repositories/Nis2GapAssessmentRepository';
import { NIS2_ANSWER } from '@/lib/schemas/nis2-gap-assessment';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logEvent } from '../events/audit';
import { getOnboardingState, completeOnboardingStep } from './onboarding';
import { logger } from '@/lib/observability/logger';

/** Resolve the tenant's single self-assessment, creating it on first touch. */
async function resolveAssessment(db: PrismaTx, ctx: RequestContext) {
    const existing = await Nis2GapAssessmentRepository.listAssessments(db, ctx, { take: 1 });
    if (existing[0]) return existing[0];
    return Nis2GapAssessmentRepository.createAssessment(db, ctx, {
        createdById: ctx.userId ?? null,
    });
}

/**
 * The full assessment state for the step UI: the 15 domains, the question
 * set, the tenant's current answers, and answered/total progress.
 */
export async function getNis2AssessmentState(ctx: RequestContext) {
    assertCanManageOnboarding(ctx);
    return runInTenantContext(ctx, async (db) => {
        const [domains, questions] = await Promise.all([
            Nis2GapAssessmentRepository.listDomains(db),
            Nis2GapAssessmentRepository.listQuestions(db),
        ]);
        const assessment = await resolveAssessment(db, ctx);
        const answers = await Nis2GapAssessmentRepository.listAnswers(db, ctx, assessment.id);
        return {
            assessmentId: assessment.id,
            status: assessment.status,
            domains,
            questions,
            answers: answers.map((a) => ({
                questionId: a.questionId,
                answer: a.answer,
                note: a.note ?? null,
            })),
            progress: { answered: answers.length, total: questions.length },
        };
    });
}

/**
 * Upsert one answer (autosave). Validates the answer enum + that the
 * question exists, sanitises the free-text note (Epic D), and emits an
 * audit entry. The assessment is resolved server-side — the client never
 * manages an assessment id.
 */
export async function saveNis2Answer(
    ctx: RequestContext,
    input: { questionId: string; answer: string; note?: string | null },
) {
    assertCanManageOnboarding(ctx);
    if (!(NIS2_ANSWER as readonly string[]).includes(input.answer)) {
        throw badRequest(`Invalid answer "${input.answer}" — expected one of ${NIS2_ANSWER.join(', ')}.`);
    }
    return runInTenantContext(ctx, async (db) => {
        const question = await Nis2GapAssessmentRepository.getQuestionById(db, input.questionId);
        if (!question) {
            throw badRequest(`Unknown NIS2 question "${input.questionId}".`);
        }
        const assessment = await resolveAssessment(db, ctx);
        const note =
            input.note != null && input.note.trim() !== ''
                ? sanitizePlainText(input.note)
                : null;
        const saved = await Nis2GapAssessmentRepository.upsertAnswer(db, ctx, {
            assessmentId: assessment.id,
            questionId: input.questionId,
            answer: input.answer,
            note,
            answeredById: ctx.userId ?? null,
        });
        await logEvent(db, ctx, {
            action: 'NIS2_ASSESSMENT_ANSWERED',
            entityType: 'Nis2SelfAssessmentAnswer',
            entityId: saved.id,
            detailsJson: { questionId: input.questionId, answer: input.answer },
        });
        return saved;
    });
}

/**
 * Mark the assessment COMPLETED (partial completion allowed) and, when
 * onboarding is still in progress, complete the NIS2_SELF_ASSESSMENT step
 * so the wizard advances to ASSET_SETUP. Completing from the resume-later
 * surface (onboarding already finished) just marks the assessment.
 */
export async function completeNis2Assessment(ctx: RequestContext) {
    assertCanManageOnboarding(ctx);
    const assessment = await runInTenantContext(ctx, async (db) => {
        const a = await resolveAssessment(db, ctx);
        return Nis2GapAssessmentRepository.markAssessmentCompleted(db, ctx, a.id);
    });

    // Advance the onboarding step only if onboarding is mid-flight.
    try {
        const state = await getOnboardingState(ctx);
        if (
            state.status === 'IN_PROGRESS' &&
            !state.completedSteps.includes('NIS2_SELF_ASSESSMENT')
        ) {
            await completeOnboardingStep(ctx, 'NIS2_SELF_ASSESSMENT');
        }
    } catch (e) {
        logger.warn('nis2 assessment: onboarding step advance skipped', {
            component: 'onboarding',
            error: e instanceof Error ? { name: e.name, message: e.message } : { name: 'UnknownError', message: String(e) },
        });
    }

    return assessment;
}
