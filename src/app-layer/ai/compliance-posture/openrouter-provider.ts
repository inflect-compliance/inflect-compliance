/**
 * AI Compliance-Posture Summary — OpenRouter provider.
 *
 * Reuses the OpenRouter chat-completions call shape from
 * `../risk-assessment/openrouter-provider.ts` (OPENROUTER_API_KEY +
 * OPENROUTER_MODEL). Asks for STRICT JSON matching PostureSummaryResult;
 * any failure falls back to the deterministic summary. ~15s timeout.
 */
import type {
    CompliancePostureProvider,
    PostureSummaryInput,
    PostureSummaryResult,
} from './types';
import { buildPosturePrompt } from './prompt-builder';
import { parsePostureJson } from './parse';
import { computeDeterministicSummary } from './stub-provider';
import { logger } from '@/lib/observability/logger';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-3.5-haiku';
const TIMEOUT_MS = 15_000;

export class OpenRouterCompliancePostureProvider implements CompliancePostureProvider {
    readonly providerName = 'openrouter';
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        this.model = model ?? DEFAULT_OPENROUTER_MODEL;
    }

    async generate(input: PostureSummaryInput): Promise<PostureSummaryResult> {
        try {
            return await this.callApi(input);
        } catch (error) {
            logger.error('OpenRouter posture-summary call failed, using deterministic fallback', {
                component: 'ai',
                error: error instanceof Error ? error.message : String(error),
            });
            return computeDeterministicSummary(input, { isFallback: true });
        }
    }

    private async callApi(input: PostureSummaryInput): Promise<PostureSummaryResult> {
        const prompt = buildPosturePrompt(input);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://inflect-compliance.app',
                    'X-Title': 'Inflect Compliance - Posture Summary',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: prompt.system },
                        {
                            role: 'user',
                            content: `${prompt.user}\n\nRespond with ONLY JSON matching this schema:\n${prompt.responseSchema}`,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 800,
                    response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'unknown');
            throw new Error(`OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const data: { choices?: { message?: { content?: string } }[] } = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('OpenRouter returned empty content');

        return parsePostureJson(content, input, { provider: 'openrouter', model: this.model });
    }
}
