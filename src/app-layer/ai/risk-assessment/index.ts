/**
 * AI Risk Assessment — Provider Factory
 *
 * Returns the appropriate provider based on environment configuration.
 * Default: stub (no API key needed).
 * Set AI_RISK_PROVIDER=openrouter + OPENROUTER_API_KEY for real LLM.
 *
 * If the configured provider fails, each provider handles its own fallback
 * to the deterministic knowledge-base templates.
 */
import type { RiskSuggestionProvider } from './types';
import { StubRiskSuggestionProvider } from './stub-provider';
import { OpenRouterRiskSuggestionProvider } from './openrouter-provider';
import { LocalRiskSuggestionProvider } from './local-provider';
import { env } from '@/env';
import { logger } from '@/lib/observability/logger';

/** Per-tenant AI-residency + local-gateway override, resolved by the usecase. */
export interface ProviderSelection {
    /**
     * `LOCAL_ONLY` is a HARD invariant: the factory MUST select a local provider
     * (or the deterministic stub) and MUST NOT construct or call the external
     * OpenRouter provider. `EXTERNAL` (default) keeps the env-driven selection.
     */
    residency?: 'EXTERNAL' | 'LOCAL_ONLY' | null;
    /** Per-tenant local-gateway base URL override (else `AI_LOCAL_BASE_URL`). */
    localBaseUrl?: string | null;
    /** Per-tenant local-model override (else `AI_LOCAL_MODEL`). */
    localModel?: string | null;
}

/** Build a local provider from the resolved base URL, or the stub if unset. */
function buildLocalProvider(sel?: ProviderSelection): RiskSuggestionProvider {
    const baseUrl = sel?.localBaseUrl || env.AI_LOCAL_BASE_URL;
    if (!baseUrl) {
        logger.warn(
            'Local AI gateway not configured (AI_LOCAL_BASE_URL / tenant override) — using the deterministic stub',
            { component: 'ai' },
        );
        return new StubRiskSuggestionProvider(/* isFallbackMode */ true);
    }
    return new LocalRiskSuggestionProvider(
        baseUrl,
        sel?.localModel || env.AI_LOCAL_MODEL || undefined,
        env.AI_LOCAL_API_KEY || undefined,
    );
}

export function getProvider(sel?: ProviderSelection): RiskSuggestionProvider {
    // ── HARD residency invariant ──────────────────────────────────────
    // A LOCAL_ONLY tenant NEVER reaches an external provider. Return a local
    // provider (or the stub) BEFORE any OpenRouter construction below. Even if
    // AI_RISK_PROVIDER=openrouter, a LOCAL_ONLY tenant's inference stays local.
    if (sel?.residency === 'LOCAL_ONLY') {
        return buildLocalProvider(sel);
    }

    const providerName = env.AI_RISK_PROVIDER?.toLowerCase() ?? 'stub';

    switch (providerName) {
        case 'local':
            return buildLocalProvider(sel);
        case 'openrouter': {
            const apiKey = env.OPENROUTER_API_KEY;
            if (!apiKey) {
                logger.warn('OPENROUTER_API_KEY not set, falling back to baseline template provider', { component: 'ai' });
                return new StubRiskSuggestionProvider(/* isFallbackMode */ true);
            }
            const model = env.OPENROUTER_MODEL ?? undefined;
            return new OpenRouterRiskSuggestionProvider(apiKey, model);
        }
        default:
            return new StubRiskSuggestionProvider();
    }
}

// Re-export types for convenience
export type { RiskSuggestionProvider, RiskAssessmentInput, RiskSuggestionOutput } from './types';
