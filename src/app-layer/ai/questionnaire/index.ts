/**
 * Inbound-questionnaire AI — provider factory (PR-9).
 *
 * Default: stub (zero config). Set AI_QUESTIONNAIRE_PROVIDER=openrouter +
 * OPENROUTER_API_KEY for the real LLM; a missing key silently falls back to
 * the stub so the feature is always functional. Mirrors ai/risk-assessment.
 */
import { env } from '@/env';
import type { QuestionnaireProvider } from './types';
import { StubQuestionnaireProvider } from './stub-provider';
import { OpenRouterQuestionnaireProvider } from './openrouter-provider';

export function getQuestionnaireProvider(): QuestionnaireProvider {
    if (env.AI_QUESTIONNAIRE_PROVIDER === 'openrouter' && env.OPENROUTER_API_KEY) {
        return new OpenRouterQuestionnaireProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL || undefined);
    }
    return new StubQuestionnaireProvider();
}

export type { QuestionnaireProvider, QuestionnaireDraftInput, QuestionnaireDraftOutput, GroundingSnippet } from './types';
