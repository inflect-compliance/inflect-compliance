/**
 * PR-H — de-ISO export artifacts.
 *
 * The Audit Readiness / Gap Analysis PDFs (and the SoA CSV) were hard-branded
 * "ISO 27001:2022 / Annex A / 93 controls" even when run against SOC 2 / NIS2.
 *
 * These assert the pure label-derivation (report-labels.ts) that the generators
 * use — for a non-ISO framework every label names the real framework and zero
 * ISO literals leak; for ISO it still reads as Annex A / SoA. (Testing the pure
 * helper rather than the rendered PDF avoids pdf-parse's environment-dependent
 * text extraction.) Plus a lighter check that the generators forward the
 * selected framework to getSoA.
 */
import {
    auditReadinessLabels,
    gapAnalysisLabels,
} from '@/app-layer/reports/pdf/report-labels';

const ISO_LEAKS = [/ISO\s*27001/i, /Annex\s*A/i, /\b93\b/];

const SOC2 = { frameworkName: 'SOC 2', isIsoFamily: false, requirementCount: 61 };
const ISO = { frameworkName: 'ISO 27001:2022', isIsoFamily: true, requirementCount: 93 };

function allStrings(o: object): string {
    return Object.values(o).join(' | ');
}

describe('report-labels — non-ISO framework (SOC 2) leaks no ISO literals', () => {
    it('Audit Readiness labels name SOC 2, never Annex A / ISO / 93', () => {
        const text = allStrings(auditReadinessLabels(SOC2));
        expect(text).toContain('SOC 2');
        expect(text).toContain('Coverage & Readiness');
        for (const rx of ISO_LEAKS) expect(text).not.toMatch(rx);
    });

    it('Gap Analysis labels name SOC 2, never Annex A / ISO / 93', () => {
        const text = allStrings(gapAnalysisLabels(SOC2, 4));
        expect(text).toContain('SOC 2');
        for (const rx of ISO_LEAKS) expect(text).not.toMatch(rx);
    });
});

describe('report-labels — ISO still reads as ISO', () => {
    it('Audit Readiness keeps Annex A / Statement of Applicability + the 93 count', () => {
        const l = auditReadinessLabels(ISO);
        expect(l.reportSubtitle).toMatch(/Statement of Applicability/);
        expect(l.applicabilitySection).toBe('Statement of Applicability');
        expect(l.tableSectionTitle).toBe('Statement of Applicability');
        expect(l.dataSourceDescription).toContain('93 Annex A controls');
    });

    it('Gap Analysis keeps Annex A requirements for ISO', () => {
        const l = gapAnalysisLabels(ISO, 2);
        expect(l.requirementsPhrase).toBe('ISO 27001:2022 Annex A requirements');
        expect(l.noGapsParagraph).toMatch(/Annex A/);
    });
});

// ─── The generators forward the selected framework to getSoA ───
const getSoAMock = jest.fn();
jest.mock('@/app-layer/usecases/soa', () => ({
    getSoA: (...args: unknown[]) => getSoAMock(...args),
}));
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: { tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }) } },
}));

import { generateAuditReadinessPdf } from '@/app-layer/reports/pdf/auditReadiness';
import { generateGapAnalysisPdf } from '@/app-layer/reports/pdf/gapAnalysis';

const soaDto = {
    tenantId: 't1',
    tenantSlug: 'acme',
    framework: 'SOC2',
    frameworkName: 'SOC 2',
    isIsoFamily: false,
    generatedAt: '2026-07-16T00:00:00.000Z',
    entries: [],
    summary: {
        total: 0,
        applicable: 0,
        notApplicable: 0,
        unmapped: 0,
        implemented: 0,
        excepted: 0,
        missingJustification: 0,
    },
};

describe('generators forward the selected framework to getSoA', () => {
    beforeEach(() => {
        getSoAMock.mockReset();
        getSoAMock.mockResolvedValue(soaDto);
    });

    it('Audit Readiness passes options.framework through', async () => {
        await generateAuditReadinessPdf({ tenantId: 't1' } as never, { framework: 'SOC2' });
        expect(getSoAMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ framework: 'SOC2' }),
        );
    });

    it('Gap Analysis passes options.framework through', async () => {
        await generateGapAnalysisPdf({ tenantId: 't1' } as never, { framework: 'SOC2' });
        expect(getSoAMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ framework: 'SOC2' }),
        );
    });
});
