/**
 * AI Compliance-Posture Summary — Anthropic (direct Claude API) provider.
 *
 * Calls the Claude Messages API directly (POST /v1/messages) and asks for
 * STRICT JSON matching PostureSummaryResult. Any error — network, non-2xx,
 * unparseable body, wrong shape — falls back to the deterministic summary so
 * the daily cron always produces a usable row. ~15s timeout.
 *
 * Requires ANTHROPIC_API_KEY; the model defaults to ANTHROPIC_MODEL
 * (claude-haiku-4-5) — a small, cheap model is plenty for a short narrative.
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

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const TIMEOUT_MS = 15_000;

export class AnthropicCompliancePostureProvider implements CompliancePostureProvider {
    readonly providerName = 'anthropic';
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        this.model = model ?? DEFAULT_ANTHROPIC_MODEL;
    }

    async generate(input: PostureSummaryInput): Promise<PostureSummaryResult> {
        try {
            return await this.callApi(input);
        } catch (error) {
            logger.error('Anthropic posture-summary call failed, using deterministic fallback', {
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
            response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 600,
                    system: prompt.system,
                    messages: [
                        {
                            role: 'user',
                            content: `${prompt.user}\n\nRespond with ONLY JSON matching this schema:\n${prompt.responseSchema}`,
                        },
                    ],
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'unknown');
            throw new Error(`Anthropic API error ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const data: { content?: { type?: string; text?: string }[] } = await response.json();
        const text = data?.content?.find((c) => c.type === 'text')?.text ?? data?.content?.[0]?.text;
        if (!text) throw new Error('Anthropic returned empty content');

        return parsePostureJson(text, input, { provider: 'anthropic', model: this.model });
    }
}
