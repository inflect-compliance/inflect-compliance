/**
 * Unit tests — compliance-posture usecase wiring.
 *
 * Verifies gatherPostureSignals maps the executive dashboard + per-framework
 * coverage into the aggregate signals, and generateCompliancePostureSummary
 * runs signals → provider → output-guard → upsert (provider mocked).
 */
import { makeRequestContext } from '../helpers/make-context';

// ── Mocks (declared before importing the usecase) ──────────────────────

const mockGetExecutiveDashboard = jest.fn();
const mockListFrameworks = jest.fn();
const mockProviderGenerate = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue({});
const mockLinkFindMany = jest.fn();

jest.mock('@/app-layer/usecases/dashboard', () => ({
    getExecutiveDashboard: (...a: unknown[]) => mockGetExecutiveDashboard(...a),
}));
jest.mock('@/app-layer/usecases/framework', () => ({
    listFrameworks: (...a: unknown[]) => mockListFrameworks(...a),
}));
jest.mock('@/app-layer/ai/compliance-posture/provider', () => ({
    getCompliancePostureProvider: () => ({ providerName: 'stub', generate: mockProviderGenerate }),
}));
jest.mock('@/lib/db-context', () => ({
    // Invoke the callback with a fake tenant-scoped client.
    runInTenantContext: (_ctx: unknown, fn: (db: unknown) => unknown) =>
        fn({
            controlRequirementLink: { findMany: (...a: unknown[]) => mockLinkFindMany(...a) },
            compliancePostureSummary: { upsert: (...a: unknown[]) => mockUpsert(...a) },
        }),
}));
jest.mock('@/lib/observability/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
    gatherPostureSignals,
    generateCompliancePostureSummary,
} from '@/app-layer/usecases/compliance-posture';

function execFixture() {
    return {
        stats: { openFindings: 2, highRisks: 3 },
        controlCoverage: { applicable: 40, implemented: 30, inProgress: 5, notStarted: 5, coveragePercent: 75 },
        riskBySeverity: { critical: 1, high: 2, medium: 4, low: 3 },
        evidenceExpiry: { overdue: 3, dueSoon7d: 1, dueSoon30d: 2, current: 90 },
        taskSummary: { open: 8, overdue: 1 },
        policySummary: { total: 5, overdueReview: 2 },
        vendorSummary: { overdueReview: 1 },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetExecutiveDashboard.mockResolvedValue(execFixture());
    mockListFrameworks.mockResolvedValue([
        { id: 'fw-iso', key: 'ISO27001', name: 'ISO/IEC 27001', _count: { requirements: 93 } },
        { id: 'fw-soc', key: 'SOC2', name: 'SOC 2', _count: { requirements: 60 } },
    ]);
    mockLinkFindMany.mockResolvedValue([
        // ISO — 50 distinct mapped of 93 (~54%), plus a duplicate to prove
        // distinct counting.
        ...Array.from({ length: 50 }, (_, i) => ({
            requirementId: `iso-${i}`,
            requirement: { frameworkId: 'fw-iso' },
        })),
        { requirementId: 'iso-0', requirement: { frameworkId: 'fw-iso' } }, // duplicate → distinct
        // SOC2 — 1 distinct mapped of 60 (~2%), the clear weakest.
        { requirementId: 'soc-1', requirement: { frameworkId: 'fw-soc' } },
    ]);
    mockProviderGenerate.mockResolvedValue({
        postureLabel: 'ESTABLISHED',
        maturityScore: 68,
        summaryText: 'Established posture.',
        advice: [{ title: 'Refresh evidence', detail: 'Overdue items.', priority: 'high' }],
        provider: 'stub',
        isFallback: false,
    });
});

describe('gatherPostureSignals', () => {
    it('maps executive dashboard counts into aggregate signals', async () => {
        const ctx = makeRequestContext('ADMIN');
        const signals = await gatherPostureSignals(ctx);

        expect(signals.controls.coveragePercent).toBe(75);
        expect(signals.risks).toEqual({ total: 10, critical: 1, high: 2, medium: 4, low: 3 });
        expect(signals.evidence.overdue).toBe(3);
        expect(signals.evidence.dueSoon).toBe(3); // 1 + 2
        expect(signals.findings.open).toBe(2);
        expect(signals.tasks).toEqual({ open: 8, overdue: 1 });
        expect(signals.policies.overdueReview).toBe(2);
        expect(signals.vendors.overdueReview).toBe(1);
    });

    it('computes distinct per-framework coverage, weakest first', async () => {
        const ctx = makeRequestContext('ADMIN');
        const signals = await gatherPostureSignals(ctx);

        // ISO: 50 distinct mapped of 93 (~54%); SOC2: 1 of 60 (~2%). Weakest
        // (SOC2) leads.
        expect(signals.frameworks[0].key).toBe('SOC2');
        expect(signals.frameworks[0].mapped).toBe(1);
        const iso = signals.frameworks.find((f) => f.key === 'ISO27001');
        expect(iso?.mapped).toBe(50);
        expect(iso?.total).toBe(93);
    });
});

describe('generateCompliancePostureSummary', () => {
    it('runs signals → provider → guard → upsert and returns the result', async () => {
        const ctx = makeRequestContext('ADMIN');
        const result = await generateCompliancePostureSummary(ctx);

        expect(mockProviderGenerate).toHaveBeenCalledTimes(1);
        // Provider receives the aggregate signals.
        expect(mockProviderGenerate.mock.calls[0][0].controls.coveragePercent).toBe(75);

        // Upsert writes the guarded result to the tenant's row.
        expect(mockUpsert).toHaveBeenCalledTimes(1);
        const upsertArg = mockUpsert.mock.calls[0][0];
        expect(upsertArg.where).toEqual({ tenantId: 'tenant-1' });
        expect(upsertArg.create.postureLabel).toBe('ESTABLISHED');
        expect(upsertArg.update.maturityScore).toBe(68);

        expect(result.postureLabel).toBe('ESTABLISHED');
    });
});
