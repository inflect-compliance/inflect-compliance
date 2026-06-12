/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * RQ2-3 — score-explanation aggregator suite.
 *
 * Covers: tenant-language formula labels, band resolution via the
 * canonical resolver, legacy-undecomposed residual flagging, control
 * summary passthrough, quant line + compact currency, open-breach
 * filtering, event actor attach, and graceful nulls for a bare risk.
 */

const mockDb = {
    risk: { findFirst: jest.fn() },
    // RQ3-OB-A — quant line speaks the tenant's currency.
    tenant: { findUnique: jest.fn().mockResolvedValue({ currencySymbol: '€' }) },
    // RQ3-4 — getPerRiskPercentiles reads the latest run; null = no
    // simulation, so the quant line renders the mean register.
    riskSimulationRun: { findFirst: jest.fn().mockResolvedValue(null) },
    riskScoreEvent: { findMany: jest.fn() },
    riskAppetiteBreach: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/usecases/risk-matrix-config', () => ({
    getRiskMatrixConfig: jest.fn(),
}));

jest.mock('@/app-layer/usecases/risk-residual-suggestion', () => ({
    loadResidualSuggestion: jest.fn(),
}));

jest.mock('@/app-layer/usecases/fair-calculator', () => ({
    resolveALE: jest.fn(),
}));

import { getRiskMatrixConfig } from '@/app-layer/usecases/risk-matrix-config';
import { loadResidualSuggestion } from '@/app-layer/usecases/risk-residual-suggestion';
import { resolveALE } from '@/app-layer/usecases/fair-calculator';
import {
    getScoreExplanation,
    formatCompactCurrency,
} from '@/app-layer/usecases/risk-score-explanation';
import { makeRequestContext } from '../helpers/make-context';

const readerCtx = makeRequestContext('READER');

const MATRIX = {
    likelihoodLevels: 5,
    impactLevels: 5,
    levelLabels: {
        likelihood: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'],
        impact: ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'],
    },
    bands: [
        { name: 'Low', minScore: 1, maxScore: 6, color: '#22c55e' },
        { name: 'Medium', minScore: 7, maxScore: 14, color: '#eab308' },
        { name: 'High', minScore: 15, maxScore: 25, color: '#ef4444' },
    ],
};

const baseRisk = (over: any = {}) => ({
    likelihood: 4,
    impact: 5,
    score: 20,
    inherentScore: 20,
    residualLikelihood: null,
    residualImpact: null,
    residualScore: null,
    sleAmount: null,
    aroAmount: null,
    fairAle: null,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    (getRiskMatrixConfig as jest.Mock).mockResolvedValue(MATRIX);
    (loadResidualSuggestion as jest.Mock).mockResolvedValue({
        risk: {},
        combined: { likelihoodReduction: 0, impactReduction: 0, contributions: [], participatingCount: 0 },
        suggestion: null,
        maxScale: 5,
    });
    (resolveALE as jest.Mock).mockReturnValue(null);
    (mockDb.riskScoreEvent.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.riskAppetiteBreach.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.user.findMany as jest.Mock).mockResolvedValue([]);
});

describe('getScoreExplanation — formula in the tenant language', () => {
    it('attaches the configured level labels and the resolved band', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());

        const e = await getScoreExplanation(readerCtx, 'r-1');

        expect(e.inherent.likelihoodLabel).toBe('Likely');
        expect(e.inherent.impactLabel).toBe('Severe');
        expect(e.inherent.bandName).toBe('High');
        expect(e.inherent.bandColor).toBe('#ef4444');
    });

    it('degrades labels to null on an unlabelled config (falls back to numerics client-side)', async () => {
        (getRiskMatrixConfig as jest.Mock).mockResolvedValue({ ...MATRIX, levelLabels: null });
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());

        const e = await getScoreExplanation(readerCtx, 'r-1');
        expect(e.inherent.likelihoodLabel).toBeNull();
    });

    it('throws notFound for a missing risk', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(getScoreExplanation(readerCtx, 'ghost')).rejects.toThrow(/Risk not found/i);
    });
});

describe('getScoreExplanation — residual semantics', () => {
    it('residual is null when never assessed', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        const e = await getScoreExplanation(readerCtx, 'r-1');
        expect(e.residual).toBeNull();
    });

    it('flags divisor-era residuals as legacyUndecomposed', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(
            baseRisk({ residualScore: 4, residualLikelihood: null, residualImpact: null }),
        );
        const e = await getScoreExplanation(readerCtx, 'r-1');
        expect(e.residual).toMatchObject({ score: 4, legacyUndecomposed: true, bandName: 'Low' });
    });

    it('decomposed residuals carry dims + band, not the legacy flag', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(
            baseRisk({ residualScore: 8, residualLikelihood: 2, residualImpact: 4 }),
        );
        const e = await getScoreExplanation(readerCtx, 'r-1');
        expect(e.residual).toMatchObject({
            likelihood: 2,
            impact: 4,
            score: 8,
            legacyUndecomposed: false,
            bandName: 'Medium',
        });
    });
});

describe('getScoreExplanation — quant, breaches, events', () => {
    it('quant line speaks the mean register (with the honest suffix) when no simulation exists', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        (resolveALE as jest.Mock).mockReturnValue(1_250_000);

        const e = await getScoreExplanation(readerCtx, 'r-1');
        // RQ3-4 — the quant line routes through the one tail formatter.
        expect(e.quant).toEqual({ ale: 1_250_000, line: '€1.3M/yr (mean — run a simulation for tails)' });
    });

    it('quant line speaks both registers when the percentile cache has this risk (RQ3-4)', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        (resolveALE as jest.Mock).mockReturnValue(1_250_000);
        (mockDb.riskSimulationRun.findFirst as jest.Mock).mockResolvedValueOnce({
            id: 'run-1',
            completedAt: new Date(),
            perRiskResultsJson: [{ riskId: 'r-1', aleMean: 1_250_000, aleP90: 4_000_000 }],
        });

        const e = await getScoreExplanation(readerCtx, 'r-1');
        expect(e.quant?.line).toBe('expected €1.3M · bad year €4.0M (P90)');
    });

    it('filters breaches to unresolved rows for THIS risk', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        (mockDb.riskAppetiteBreach.findMany as jest.Mock).mockResolvedValue([
            { breachType: 'SINGLE_RISK_ALE', thresholdValue: 100, actualValue: 150, detectedAt: new Date() },
        ]);

        const e = await getScoreExplanation(readerCtx, 'r-1');

        const q = (mockDb.riskAppetiteBreach.findMany as jest.Mock).mock.calls[0][0];
        expect(q.where).toMatchObject({ riskId: 'r-1', resolvedAt: null });
        expect(e.openBreaches).toHaveLength(1);
    });

    it('attaches actor names to recent events via one batched lookup', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        (mockDb.riskScoreEvent.findMany as jest.Mock).mockResolvedValue([
            { kind: 'INHERENT', likelihood: 4, impact: 5, score: 20, source: 'USER', justification: null, createdByUserId: 'u-1', createdAt: new Date() },
            { kind: 'RESIDUAL', likelihood: 0, impact: 0, score: 4, source: 'MIGRATION', justification: 'backfill', createdByUserId: null, createdAt: new Date() },
        ]);
        (mockDb.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u-1', name: 'Alice' }]);

        const e = await getScoreExplanation(readerCtx, 'r-1');

        expect(e.recentEvents[0].actorName).toBe('Alice');
        expect(e.recentEvents[1].actorName).toBeNull();
        expect(e.recentEvents[1].source).toBe('MIGRATION');
        expect(mockDb.user.findMany).toHaveBeenCalledTimes(1);
    });

    it('events query is bounded to the 5 most recent', async () => {
        (mockDb.risk.findFirst as jest.Mock).mockResolvedValue(baseRisk());
        await getScoreExplanation(readerCtx, 'r-1');
        const q = (mockDb.riskScoreEvent.findMany as jest.Mock).mock.calls[0][0];
        expect(q.take).toBe(5);
        expect(q.orderBy).toEqual({ createdAt: 'desc' });
    });
});

describe('formatCompactCurrency', () => {
    it.each([
        [900, '€900'],
        [43_000, '€43K'],
        [1_250_000, '€1.3M'],
        [999, '€999'],
        [1_000, '€1K'],
    ])('%d → %s', (input, expected) => {
        expect(formatCompactCurrency(input as number)).toBe(expected);
    });
});
