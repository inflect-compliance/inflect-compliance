/**
 * H4 — AI provider egress hardening (questionnaire).
 *   - OpenRouter request is cost-bounded (max_tokens).
 *   - The stub no longer auto-drafts a false-affirmative on a single keyword.
 */
import { OpenRouterQuestionnaireProvider } from '@/app-layer/ai/questionnaire/openrouter-provider';
import { StubQuestionnaireProvider } from '@/app-layer/ai/questionnaire/stub-provider';
import type { GroundingSnippet } from '@/app-layer/ai/questionnaire/types';

describe('H4 — OpenRouter cost bound', () => {
    it('sets max_tokens on the completion request', async () => {
        const fetchMock = jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'x', confidence: 0.5, citationIndexes: [] }) } }] }), { status: 200 }));
        const provider = new OpenRouterQuestionnaireProvider('key', 'model', fetchMock as unknown as typeof fetch);
        await provider.draftAnswer({ question: 'Do you encrypt data at rest?', grounding: [] });
        const init = (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1];
        const body = JSON.parse(init.body);
        expect(body.max_tokens).toBe(800);
    });
});

describe('H4 — stub no longer over-confidently affirms', () => {
    const g = (label: string, text: string): GroundingSnippet => ({ kind: 'CONTROL', id: 'c1', label, text });

    it('a single weak keyword overlap does NOT clear the 0.4 auto-DRAFT floor', async () => {
        const stub = new StubQuestionnaireProvider();
        // Question has several tokens; only one overlaps the grounding label.
        const out = await stub.draftAnswer({ question: 'Do you perform annual penetration testing of production systems?', grounding: [g('Testing policy', 'testing cadence')] });
        expect(out.confidence).toBeLessThan(0.4);
    });

    it('does not lead the answer with an affirmative "Yes."', async () => {
        const stub = new StubQuestionnaireProvider();
        const out = await stub.draftAnswer({ question: 'encryption at rest', grounding: [g('Encryption', 'data at rest encryption AES-256')] });
        expect(out.answer.startsWith('Yes')).toBe(false);
        expect(out.answer).toMatch(/verify before submitting/i);
    });
});
