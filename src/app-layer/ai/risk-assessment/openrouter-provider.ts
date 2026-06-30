/**
 * AI Risk Assessment — OpenRouter Provider (Enhanced)
 *
 * Real LLM-backed provider that calls the OpenRouter API.
 * Requires OPENROUTER_API_KEY env var.
 * Falls back to deterministic templates if the API call fails.
 */
import type { RiskAssessmentInput, RiskSuggestionOutput, RiskSuggestionProvider } from './types';
import { buildRiskAssessmentPrompt } from './prompt-builder';
import { RiskSuggestionOutputSchema } from './schemas';
import { StubRiskSuggestionProvider } from './stub-provider';
import { logger } from '@/lib/observability/logger';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// AISVS C6 (model supply chain): PIN to a dated model snapshot rather than the
// floating `anthropic/claude-3.5-sonnet` alias, so an upstream model swap can't
// silently change risk-assessment behaviour. Updating the model is a deliberate,
// reviewed change to this constant (or the OPENROUTER_MODEL env override) — see
// docs/security/aisvs-self-assessment.md (Ch6) for the model-update process.
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet-20241022';

export class OpenRouterRiskSuggestionProvider implements RiskSuggestionProvider {
    readonly providerName = 'openrouter';
    private apiKey: string;
    private model: string;
    private fallback: StubRiskSuggestionProvider;

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        this.model = model ?? DEFAULT_MODEL;
        this.fallback = new StubRiskSuggestionProvider(/* isFallbackMode */ true);
    }

    async generateSuggestions(input: RiskAssessmentInput): Promise<RiskSuggestionOutput> {
        try {
            return await this.callApi(input);
        } catch (error) {
            logger.error('OpenRouter API call failed, using fallback', { component: 'ai' });
            return this.fallback.generateSuggestions(input);
        }
    }

    private async callApi(input: RiskAssessmentInput): Promise<RiskSuggestionOutput> {
        const prompt = buildRiskAssessmentPrompt(input);

        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://inflect-compliance.app',
                'X-Title': 'Inflect Compliance - Risk Assessment',
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
                max_tokens: 4096,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'unknown');
            throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
        }

        const data: {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        } = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('OpenRouter returned empty content');
        }

        // AISVS C12.1.3 / C12.2.5 — capture token usage when the provider
        // reports it (OpenRouter echoes OpenAI's `usage` object). Maps to
        // camelCase TokenUsage; omitted entirely when absent.
        const u = data.usage;
        const usage =
            u && (u.prompt_tokens != null || u.completion_tokens != null)
                ? {
                      promptTokens: u.prompt_tokens ?? 0,
                      completionTokens: u.completion_tokens ?? 0,
                      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
                  }
                : undefined;

        // Parse and validate the JSON response
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
        }

        const validated = RiskSuggestionOutputSchema.parse(parsed);

        return {
            suggestions: validated.suggestions.map(s => ({
                ...s,
                suggestedControls: s.suggestedControls ?? [],
                confidence: s.confidence ?? 'medium',
                structuredRationale: s.structuredRationale ?? {
                    whyThisRisk: s.rationale,
                    affectedAssetCharacteristics: [],
                    suggestedControlThemes: s.suggestedControls ?? [],
                },
            })),
            modelName: this.model,
            provider: 'openrouter',
            isFallback: false,
            usage,
        };
    }
}
