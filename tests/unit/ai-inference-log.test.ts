/**
 * AISVS L2 — structured inference log (C12.1.3 / C12.1.2 / C12.2.5).
 *
 * `buildInferenceLog` is the canonical structured record attached to the
 * generation audit event. Proves the schema shape, the token capture, and the
 * safety-decision block.
 */
import { buildInferenceLog } from '@/app-layer/ai/risk-assessment/inference-log';

const SAFE = {
    outputRedactions: 0,
    droppedLowConfidence: 0,
    inputAnomalyCount: 0,
    reviewRecommended: false,
    fallback: false,
};

describe('AISVS C12.1.3 — structured inference log', () => {
    it('carries the versioned schema + core fields', () => {
        const log = buildInferenceLog({
            provider: 'openrouter',
            model: 'anthropic/claude-3.5-sonnet-20241022',
            outcome: 'success',
            durationMs: 1234,
            usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
            suggestionCount: 7,
            safety: SAFE,
        });
        expect(log.schema).toBe('ai.inference.v1');
        expect(log.provider).toBe('openrouter');
        expect(log.model).toBe('anthropic/claude-3.5-sonnet-20241022');
        expect(log.outcome).toBe('success');
        expect(log.durationMs).toBe(1234);
        expect(log.suggestionCount).toBe(7);
    });

    it('captures token usage when reported (C12.2.5)', () => {
        const log = buildInferenceLog({
            provider: 'openrouter',
            model: 'm',
            outcome: 'success',
            durationMs: 10,
            usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
            suggestionCount: 1,
            safety: SAFE,
        });
        expect(log.promptTokens).toBe(800);
        expect(log.completionTokens).toBe(200);
        expect(log.totalTokens).toBe(1000);
    });

    it('reports null tokens when the provider reports none (stub/fallback)', () => {
        const log = buildInferenceLog({
            provider: 'stub',
            model: 'stub',
            outcome: 'success',
            durationMs: 1,
            suggestionCount: 3,
            safety: SAFE,
        });
        expect(log.promptTokens).toBeNull();
        expect(log.completionTokens).toBeNull();
        expect(log.totalTokens).toBeNull();
    });

    it('carries the safety-decision block (C12.1.2)', () => {
        const log = buildInferenceLog({
            provider: 'openrouter',
            model: 'm',
            outcome: 'success',
            durationMs: 5,
            suggestionCount: 4,
            safety: {
                outputRedactions: 2,
                droppedLowConfidence: 1,
                inputAnomalyCount: 3,
                reviewRecommended: true,
                fallback: false,
            },
        });
        expect(log.safetyDecisions).toEqual({
            outputRedactions: 2,
            droppedLowConfidence: 1,
            inputAnomalyCount: 3,
            reviewRecommended: true,
            fallback: false,
        });
    });

    it('records a failure inference the same structured way', () => {
        const log = buildInferenceLog({
            provider: 'openrouter',
            model: 'unknown',
            outcome: 'failure',
            durationMs: 42,
            suggestionCount: 0,
            safety: { ...SAFE, fallback: true },
        });
        expect(log.outcome).toBe('failure');
        expect(log.suggestionCount).toBe(0);
        expect(log.safetyDecisions.fallback).toBe(true);
    });
});
