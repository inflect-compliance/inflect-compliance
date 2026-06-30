/**
 * AISVS C6.1.4 — behavioral eval before relying on the model.
 *
 * A deterministic golden-prompt eval against the STUB provider (no network):
 * a fixed input must always yield a well-formed, in-bounds risk-suggestion
 * output. This is the behavioural contract the prompt + schema layer must keep
 * — a regression here means the AI output shape drifted.
 *
 * AISVS C5.2.1 (L2) — the default-deny allow-list gate is also proven here.
 */
import { StubRiskSuggestionProvider } from '@/app-layer/ai/risk-assessment/stub-provider';
import { RiskSuggestionOutputSchema } from '@/app-layer/ai/risk-assessment/schemas';
import { checkFeatureGate } from '@/app-layer/ai/risk-assessment/feature-gate';
import type { RiskAssessmentInput } from '@/app-layer/ai/risk-assessment/types';
import type { RequestContext } from '@/app-layer/types';

const GOLDEN_INPUT: RiskAssessmentInput = {
    tenantIndustry: 'Financial Services',
    tenantContext: 'A mid-size fintech processing card payments.',
    frameworks: ['ISO27001'],
    assets: [
        { id: 'a1', name: 'Payments API', type: 'APPLICATION', criticality: 'HIGH' },
        { id: 'a2', name: 'Customer Database', type: 'DATABASE', criticality: 'HIGH' },
    ],
    existingControls: ['A.8.1 Asset inventory'],
    maxRiskScale: 5,
};

describe('AISVS C6.1.4 — golden-prompt behavioral eval (stub, deterministic)', () => {
    it('produces a well-formed, in-bounds output for the golden input', async () => {
        const provider = new StubRiskSuggestionProvider();
        const out = await provider.generateSuggestions(GOLDEN_INPUT);

        // Shape — passes the same schema the real provider output must pass.
        const parsed = RiskSuggestionOutputSchema.safeParse({ suggestions: out.suggestions });
        expect(parsed.success).toBe(true);

        // At least one suggestion, and every score is in 1..maxScale.
        expect(out.suggestions.length).toBeGreaterThan(0);
        for (const s of out.suggestions) {
            expect(s.title.length).toBeGreaterThan(0);
            expect(s.likelihood).toBeGreaterThanOrEqual(1);
            expect(s.likelihood).toBeLessThanOrEqual(5);
            expect(s.impact).toBeGreaterThanOrEqual(1);
            expect(s.impact).toBeLessThanOrEqual(5);
            expect(['high', 'medium', 'low']).toContain(s.confidence);
        }
    });

    it('is deterministic — the same input yields the same titles', async () => {
        const provider = new StubRiskSuggestionProvider();
        const a = await provider.generateSuggestions(GOLDEN_INPUT);
        const b = await provider.generateSuggestions(GOLDEN_INPUT);
        expect(a.suggestions.map((s) => s.title)).toEqual(b.suggestions.map((s) => s.title));
    });
});

describe('AISVS C5.2.1 (L2) — default-deny allow-list gate', () => {
    const ctx = (canWrite: boolean): RequestContext =>
        ({ permissions: { canWrite } }) as unknown as RequestContext;

    it('allows a write-capable caller when the feature flag is on (env default)', () => {
        expect(checkFeatureGate(ctx(true)).allowed).toBe(true);
    });

    it('denies a non-write caller (default-deny on the role predicate)', () => {
        const result = checkFeatureGate(ctx(false));
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Editor or Admin/i);
    });
});
