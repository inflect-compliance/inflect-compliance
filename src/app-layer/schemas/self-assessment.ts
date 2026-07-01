/**
 * Getting-started self-assessment schemas.
 *
 * The assessment-key enum is the registry of embedded posture self-assessments
 * surfaced in onboarding. Today: the Digital Sovereignty Posture. New posture
 * assessments add their key here and register a bank in
 * `usecases/self-assessment`.
 */
import { z } from 'zod';

/** Every embedded getting-started self-assessment key. */
export const SelfAssessmentKeySchema = z.enum(['digital-sovereignty']);
export type SelfAssessmentKey = z.infer<typeof SelfAssessmentKeySchema>;

/**
 * Materialise-suggestions input. The client sends its answers + the dimensions
 * whose suggested risk/control it approved. The server RE-SCORES from the
 * answers (never trusts a client-sent score) and only creates suggestions for
 * dimensions that genuinely fall below the gap threshold.
 */
export const MaterializeSelfAssessmentSchema = z.object({
    key: SelfAssessmentKeySchema,
    /** questionId → chosen option score (0..4). */
    answers: z.record(z.string(), z.number().int().min(0).max(4)),
    /** Per-dimension approvals — which of the suggested risk/control to create. */
    approvals: z
        .array(
            z.object({
                dimensionId: z.number().int().positive(),
                createRisk: z.boolean().default(true),
                createControl: z.boolean().default(true),
            }),
        )
        .max(20),
});
export type MaterializeSelfAssessmentInput = z.infer<typeof MaterializeSelfAssessmentSchema>;
