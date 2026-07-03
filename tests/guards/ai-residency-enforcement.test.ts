/**
 * AI residency enforcement — ratchet (AI sovereignty / DS-1).
 *
 * The invariant: a tenant with `aiResidency=LOCAL_ONLY` NEVER reaches an
 * external provider. The provider factory MUST select the local provider (or
 * the deterministic stub when no local gateway is configured) and MUST NOT
 * construct or call the external OpenRouter provider — even when
 * AI_RISK_PROVIDER=openrouter with a key present. EXTERNAL is unchanged.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const mutableEnv: Record<string, string | undefined> = {
    AI_RISK_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: undefined,
    AI_LOCAL_BASE_URL: 'http://local-gateway:8080',
    AI_LOCAL_MODEL: 'llama3.1',
    AI_LOCAL_API_KEY: undefined,
};
jest.mock('@/env', () => ({ env: mutableEnv }));

// Spy on the EXTERNAL provider's constructor so we can assert it is NEVER
// invoked for a LOCAL_ONLY tenant.
const openRouterCtor = jest.fn();
jest.mock('@/app-layer/ai/risk-assessment/openrouter-provider', () => ({
    DEFAULT_MODEL: 'anthropic/claude-3.5-sonnet-20241022',
    OpenRouterRiskSuggestionProvider: class {
        readonly providerName = 'openrouter';
        constructor(...args: unknown[]) {
            openRouterCtor(...args);
        }
        generateSuggestions() {
            return Promise.resolve({ suggestions: [], modelName: 'x', provider: 'openrouter' });
        }
    },
}));

import { getProvider } from '@/app-layer/ai/risk-assessment';
import { LocalRiskSuggestionProvider } from '@/app-layer/ai/risk-assessment/local-provider';
import type { RiskAssessmentInput } from '@/app-layer/ai/risk-assessment/types';

beforeEach(() => {
    jest.clearAllMocks();
    mutableEnv.AI_RISK_PROVIDER = 'openrouter';
    mutableEnv.OPENROUTER_API_KEY = 'test-key';
    mutableEnv.AI_LOCAL_BASE_URL = 'http://local-gateway:8080';
    mutableEnv.AI_LOCAL_MODEL = 'llama3.1';
});

describe('LOCAL_ONLY residency invariant', () => {
    it('returns the LOCAL provider and NEVER constructs the external one', () => {
        const provider = getProvider({ residency: 'LOCAL_ONLY' });
        expect(provider).toBeInstanceOf(LocalRiskSuggestionProvider);
        expect(provider.providerName).toBe('local');
        // Even though AI_RISK_PROVIDER=openrouter with a key, the external
        // provider was never constructed.
        expect(openRouterCtor).not.toHaveBeenCalled();
    });

    it('a per-tenant local base URL overrides the env default', () => {
        const provider = getProvider({ residency: 'LOCAL_ONLY', localBaseUrl: 'http://tenant-gw:9000', localModel: 'mistral' });
        expect(provider).toBeInstanceOf(LocalRiskSuggestionProvider);
        expect(openRouterCtor).not.toHaveBeenCalled();
    });

    it('falls back to the stub (NOT external) when no local gateway is configured', () => {
        mutableEnv.AI_LOCAL_BASE_URL = undefined;
        const provider = getProvider({ residency: 'LOCAL_ONLY' });
        // Never external, even without a local gateway.
        expect(provider.providerName).not.toBe('openrouter');
        expect(provider).not.toBeInstanceOf(LocalRiskSuggestionProvider);
        expect(openRouterCtor).not.toHaveBeenCalled();
    });
});

describe('EXTERNAL residency (default) — unchanged', () => {
    it('uses the env-configured external provider', () => {
        const provider = getProvider({ residency: 'EXTERNAL' });
        expect(provider.providerName).toBe('openrouter');
        expect(openRouterCtor).toHaveBeenCalledTimes(1);
    });

    it('no residency passed behaves as EXTERNAL', () => {
        const provider = getProvider();
        expect(provider.providerName).toBe('openrouter');
    });
});

describe('LocalRiskSuggestionProvider conformance', () => {
    const input: RiskAssessmentInput = {
        tenantIndustry: 'fintech',
        tenantContext: 'test',
        frameworks: ['ISO27001'],
        assets: [{ id: 'a1', name: 'DB', type: 'DATABASE', criticality: 'HIGH', classification: null, confidentiality: 5, integrity: 5, availability: 5 }],
        existingControls: [],
        maxRiskScale: 5,
    };

    it('implements the RiskSuggestionProvider interface', () => {
        const p = new LocalRiskSuggestionProvider('http://local-gateway:8080', 'llama3');
        expect(p.providerName).toBe('local');
        expect(typeof p.generateSuggestions).toBe('function');
    });

    it('falls back to the deterministic stub on a gateway error (never throws)', async () => {
        const realFetch = global.fetch;
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
        try {
            const p = new LocalRiskSuggestionProvider('http://unreachable:1', 'llama3');
            const out = await p.generateSuggestions(input);
            // Fallback returns a valid output shape without throwing.
            expect(Array.isArray(out.suggestions)).toBe(true);
            expect(out.provider).not.toBe('local'); // it degraded to the stub/fallback
        } finally {
            global.fetch = realFetch;
        }
    });
});

describe('structural — LOCAL_ONLY short-circuits before OpenRouter', () => {
    it('the factory returns for LOCAL_ONLY before any OpenRouter construction', () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../../src/app-layer/ai/risk-assessment/index.ts'),
            'utf8',
        );
        const localOnlyIdx = src.indexOf("residency === 'LOCAL_ONLY'");
        const openRouterIdx = src.indexOf('new OpenRouterRiskSuggestionProvider');
        expect(localOnlyIdx).toBeGreaterThan(-1);
        expect(openRouterIdx).toBeGreaterThan(-1);
        // The LOCAL_ONLY guard clause appears BEFORE the OpenRouter construction.
        expect(localOnlyIdx).toBeLessThan(openRouterIdx);
        // And that guard returns (short-circuits).
        const between = src.slice(localOnlyIdx, openRouterIdx);
        expect(between).toMatch(/return buildLocalProvider/);
    });
});
