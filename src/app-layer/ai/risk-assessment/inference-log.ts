/**
 * AI Risk Assessment — structured inference log (AISVS L2).
 *
 * One canonical, structured record per inference, attached to the generation
 * audit event's `detailsJson`. Replaces ad-hoc scattered metadata with a typed
 * schema so a SIEM can parse every AI call uniformly:
 *
 *   - **C12.1.3** — structured schema for inference logs (provider, model,
 *     token counts, latency, outcome).
 *   - **C12.1.2** — log safety-filtering / policy decisions: the
 *     `safetyDecisions` block records what the output gate + input screen did
 *     (redactions, low-confidence drops, input anomalies, fallback, the
 *     resulting review recommendation).
 *
 * Per-tenant attribution (C12.2.5) comes for free: the audit event carries the
 * tenant + actor context, so this structured payload is granular by tenant +
 * session without embedding tenant ids in the log body.
 */
import type { TokenUsage } from './types';

export interface InferenceSafetyDecisions {
    /** Output fields whose system-prompt/instruction leak was redacted (C7.3.2). */
    outputRedactions: number;
    /** Suggestions dropped for being below the confidence floor (C7.2.2). */
    droppedLowConfidence: number;
    /** Anomaly signals found in the input screen (C11.4.1). */
    inputAnomalyCount: number;
    /** Whether the draft was flagged for careful human review (C11.4.2). */
    reviewRecommended: boolean;
    /** Whether output came from the deterministic stub fallback. */
    fallback: boolean;
}

export interface AiInferenceLog {
    schema: 'ai.inference.v1';
    provider: string;
    model: string;
    outcome: 'success' | 'failure';
    durationMs: number;
    /** Token usage when the provider reported it (stub/fallback report none). */
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    /** Suggestions surfaced after the output gate (0 on failure). */
    suggestionCount: number;
    /** AISVS C6.1.3 — true when the provider served a different model than
     *  requested (silent-swap detection); null when unknown (stub/fallback). */
    modelMismatch: boolean | null;
    safetyDecisions: InferenceSafetyDecisions;
}

export function buildInferenceLog(input: {
    provider: string;
    model: string;
    outcome: 'success' | 'failure';
    durationMs: number;
    usage?: TokenUsage;
    suggestionCount: number;
    modelMismatch?: boolean | null;
    safety: InferenceSafetyDecisions;
}): AiInferenceLog {
    return {
        schema: 'ai.inference.v1',
        provider: input.provider,
        model: input.model,
        outcome: input.outcome,
        durationMs: input.durationMs,
        promptTokens: input.usage?.promptTokens ?? null,
        completionTokens: input.usage?.completionTokens ?? null,
        totalTokens: input.usage?.totalTokens ?? null,
        suggestionCount: input.suggestionCount,
        modelMismatch: input.modelMismatch ?? null,
        safetyDecisions: input.safety,
    };
}
