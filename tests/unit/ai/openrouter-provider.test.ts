/**
 * Unit coverage for the OpenRouter AI risk provider. Every branch is exercised
 * with a mocked global `fetch` — no live API call.
 */
jest.mock('../../../src/app-layer/ai/risk-assessment/prompt-builder', () => ({
    buildRiskAssessmentPrompt: () => ({ system: 'sys', user: 'usr', responseSchema: '{}' }),
}));
jest.mock('../../../src/app-layer/ai/risk-assessment/schemas', () => ({
    RiskSuggestionOutputSchema: { parse: (x: unknown) => x },
}));
jest.mock('../../../src/app-layer/ai/risk-assessment/stub-provider', () => ({
    StubRiskSuggestionProvider: jest.fn().mockImplementation(() => ({
        generateSuggestions: jest.fn().mockResolvedValue({ suggestions: [], provider: 'stub', isFallback: true }),
    })),
}));
jest.mock('@/lib/observability/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { OpenRouterRiskSuggestionProvider, DEFAULT_MODEL } from '@/app-layer/ai/risk-assessment/openrouter-provider';
import { logger } from '@/lib/observability/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input: any = { tenantIndustry: 'fin', frameworks: [], assets: [] };
function mockFetch(impl: () => unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn(impl);
}
function okResponse(body: unknown) {
    return { ok: true, json: async () => body } as unknown as Response;
}
const SUGG = { suggestions: [{ title: 'R', rationale: 'because' }] };

afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

describe('OpenRouterRiskSuggestionProvider', () => {
    it('warns once when the model is overridden from the pinned default', () => {
        new OpenRouterRiskSuggestionProvider('key', 'some/other-model');
        expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/overridden/i), expect.any(Object));
    });

    it('does not warn when using the pinned default model', () => {
        new OpenRouterRiskSuggestionProvider('key');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('calls the API and maps defaults + usage; flags a served-model mismatch', async () => {
        mockFetch(() => Promise.resolve(okResponse({
            choices: [{ message: { content: JSON.stringify(SUGG) } }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
            model: 'served/different',
        })));
        const p = new OpenRouterRiskSuggestionProvider('key'); // default model
        const out = await p.generateSuggestions(input);
        expect(out.provider).toBe('openrouter');
        expect(out.modelName).toBe(DEFAULT_MODEL);
        expect(out.modelMismatch).toBe(true);
        expect(out.usage).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: 7 });
        expect(out.suggestions[0].confidence).toBe('medium');
        expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/different model/i), expect.any(Object));
    });

    it('omits usage when the provider reports none', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: JSON.stringify(SUGG) } }] })));
        const out = await new OpenRouterRiskSuggestionProvider('key').generateSuggestions(input);
        expect(out.usage).toBeUndefined();
        expect(out.modelMismatch).toBe(false);
    });

    it('falls back to the stub on a non-OK response', async () => {
        mockFetch(() => Promise.resolve({ ok: false, status: 429, text: async () => 'rate' } as unknown as Response));
        await expect(new OpenRouterRiskSuggestionProvider('key').generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back on empty content', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: '' } }] })));
        await expect(new OpenRouterRiskSuggestionProvider('key').generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back on invalid JSON', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: '{bad' } }] })));
        await expect(new OpenRouterRiskSuggestionProvider('key').generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back when fetch throws', async () => {
        mockFetch(() => Promise.reject(new Error('network')));
        await expect(new OpenRouterRiskSuggestionProvider('key').generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });
});
