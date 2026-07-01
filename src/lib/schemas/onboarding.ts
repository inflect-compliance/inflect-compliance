import { z } from 'zod';

/**
 * Canonical onboarding wizard steps — ordered.
 */
export const ONBOARDING_STEPS = [
    'COMPANY_PROFILE',
    'FRAMEWORK_SELECTION',
    // Conditional step: only applicable when NIS2 is among the selected
    // frameworks (see `isStepApplicable` in usecases/onboarding.ts). Sits
    // right after FRAMEWORK_SELECTION so its results can feed the
    // CONTROL_BASELINE_INSTALL step that follows.
    'NIS2_SELF_ASSESSMENT',
    // Conditional step: applicable when an AI framework (AISVS / ISO42001 /
    // EU_AI_ACT) is selected OR the tenant builds/uses AI systems (see
    // `isStepApplicable`). Unified AISVS / ISO 42001 / EU AI Act self-assessment.
    'AI_GOVERNANCE_SELF_ASSESSMENT',
    // Conditional step: applicable when an EU digital-regulation framework
    // (NIS2 / DORA / EU AI Act) is selected (see `isStepApplicable`). Digital
    // Sovereignty Posture self-assessment — stateless, materialises approved
    // gaps into risks + controls.
    'SOVEREIGNTY_SELF_ASSESSMENT',
    'ASSET_SETUP',
    'CONTROL_BASELINE_INSTALL',
    'INITIAL_RISK_REGISTER',
    'TEAM_SETUP',
    'REVIEW_AND_FINISH',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const OnboardingStepEnum = z.enum(ONBOARDING_STEPS);

/**
 * Steps that MUST be completed (not skippable) to finish onboarding.
 */
export const REQUIRED_STEPS: OnboardingStep[] = ['COMPANY_PROFILE', 'REVIEW_AND_FINISH'];

/**
 * Steps that can be explicitly skipped by the admin.
 */
export const SKIPPABLE_STEPS: OnboardingStep[] = [
    'FRAMEWORK_SELECTION',
    // Skippable: skipped entirely when NIS2 isn't chosen, and skippable
    // on demand ("complete later from the NIS2 dashboard") when it is.
    'NIS2_SELF_ASSESSMENT',
    // Skippable: skipped entirely when no AI framework / AI-systems flag, and
    // skippable on demand ("complete later") when applicable.
    'AI_GOVERNANCE_SELF_ASSESSMENT',
    // Skippable: skipped entirely when no EU digital-regulation framework, and
    // skippable on demand ("complete later") when applicable.
    'SOVEREIGNTY_SELF_ASSESSMENT',
    'ASSET_SETUP',
    'CONTROL_BASELINE_INSTALL',
    'INITIAL_RISK_REGISTER',
    'TEAM_SETUP',
];

/**
 * Schema for saving step data.
 * `step` identifies which step, `data` carries step-specific payload.
 */
export const SaveStepSchema = z.object({
    step: OnboardingStepEnum,
    data: z.record(z.string(), z.unknown()).default({}),
}).strip();

/**
 * Schema for completing a step.
 */
export const CompleteStepSchema = z.object({
    step: OnboardingStepEnum,
}).strip();

/**
 * Schema for skipping a step.
 */
export const SkipStepSchema = z.object({
    step: OnboardingStepEnum,
}).strip();

export type SaveStepInput = z.infer<typeof SaveStepSchema>;
export type CompleteStepInput = z.infer<typeof CompleteStepSchema>;
export type SkipStepInput = z.infer<typeof SkipStepSchema>;

