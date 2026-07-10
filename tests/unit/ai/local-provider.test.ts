/**
 * Unit coverage for the local / self-hosted AI risk provider (AI sovereignty).
 * Every branch is exercised with a mocked global `fetch` — no live gateway.
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
jest.mock('@/lib/observability/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { LocalRiskSuggestionProvider } from '@/app-layer/ai/risk-assessment/local-provider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const input: any = { tenantIndustry: 'fin', frameworks: [], assets: [] };
function mockFetch(impl: () => unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn(impl);
}
function okResponse(body: unknown) {
    return { ok: true, json: async () => body } as unknown as Response;
}
const SUGG = { suggestions: [{ title: 'R', rationale: 'because', suggestedControls: undefined, confidence: undefined, structuredRationale: undefined }] };

afterEach(() => { jest.restoreAllMocks(); });

describe('LocalRiskSuggestionProvider', () => {
    it('calls the gateway and maps defaults + usage + modelMismatch', async () => {
        mockFetch(() => Promise.resolve(okResponse({
            choices: [{ message: { content: JSON.stringify(SUGG) } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            model: 'other-model',
        })));
        const p = new LocalRiskSuggestionProvider('http://gw.local/', 'my-model', 'key123');
        const out = await p.generateSuggestions(input);
        expect(out.provider).toBe('local');
        expect(out.isFallback).toBe(false);
        expect(out.modelMismatch).toBe(true); // actual 'other-model' !== 'my-model'
        expect(out.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
        expect(out.suggestions[0].suggestedControls).toEqual([]);
        expect(out.suggestions[0].confidence).toBe('medium');
        // apiKey → Authorization header sent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headers = ((global as any).fetch.mock.calls[0][1]).headers;
        expect(headers.Authorization).toBe('Bearer key123');
    });

    it('appends /v1/chat/completions to a bare host and omits auth without a key', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: JSON.stringify(SUGG) } }] })));
        const p = new LocalRiskSuggestionProvider('http://gw.local');
        const out = await p.generateSuggestions(input);
        expect(out.usage).toBeUndefined(); // no usage in payload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [url, opts] = (global as any).fetch.mock.calls[0];
        expect(url).toBe('http://gw.local/v1/chat/completions');
        expect(opts.headers.Authorization).toBeUndefined();
    });

    it('normalises a pre-suffixed /v1 base URL', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: JSON.stringify(SUGG) } }] })));
        const p = new LocalRiskSuggestionProvider('http://gw.local/v1');
        await p.generateSuggestions(input);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((global as any).fetch.mock.calls[0][0]).toBe('http://gw.local/v1/chat/completions');
    });

    it('falls back to the stub on a non-OK response', async () => {
        mockFetch(() => Promise.resolve({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response));
        const p = new LocalRiskSuggestionProvider('http://gw.local');
        await expect(p.generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back to the stub on empty content', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: '' } }] })));
        const p = new LocalRiskSuggestionProvider('http://gw.local');
        await expect(p.generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back to the stub on invalid JSON content', async () => {
        mockFetch(() => Promise.resolve(okResponse({ choices: [{ message: { content: 'not json{' } }] })));
        const p = new LocalRiskSuggestionProvider('http://gw.local');
        await expect(p.generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });

    it('falls back to the stub when fetch throws', async () => {
        mockFetch(() => Promise.reject(new Error('network')));
        const p = new LocalRiskSuggestionProvider('http://gw.local', '');
        await expect(p.generateSuggestions(input)).resolves.toMatchObject({ isFallback: true });
    });
});
