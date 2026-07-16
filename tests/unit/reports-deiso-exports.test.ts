/**
 * PR-H — de-ISO export artifacts.
 *
 * The Audit Readiness / Gap Analysis PDFs (and the SoA CSV) were hard-branded
 * "ISO 27001:2022 / Annex A / 93 controls" even when run against SOC 2 / NIS2.
 * These tests assert that for a non-ISO framework the artifact names the real
 * framework and zero ISO literals leak — and that ISO still reads as ISO.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
import type { SoAReportDTO } from '@/lib/dto/soa';

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

const pdfParse = require('pdf-parse');

const ctx = { tenantId: 't1', tenantSlug: 'acme' } as never;

function dto(over: Partial<SoAReportDTO>): SoAReportDTO {
    return {
        tenantId: 't1',
        tenantSlug: 'acme',
        framework: 'SOC2',
        frameworkName: 'SOC 2',
        isIsoFamily: false,
        generatedAt: '2026-07-16T00:00:00.000Z',
        entries: [
            {
                requirementId: 'r1',
                requirementCode: 'CC1.1',
                requirementTitle: 'Control environment',
                section: 'CC',
                applicable: true,
                justification: null,
                implementationStatus: 'IMPLEMENTED',
                verdict: 'implemented',
                exceptedUntil: null,
                mappedControls: [],
                evidenceCount: 1,
                openTaskCount: 0,
                lastTestResult: 'PASS',
            },
        ],
        summary: {
            total: 1,
            applicable: 1,
            notApplicable: 0,
            unmapped: 0,
            implemented: 1,
            excepted: 0,
            missingJustification: 0,
        },
        ...over,
    };
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

async function pdfText(doc: PDFKit.PDFDocument): Promise<string> {
    const buf = await collectPdf(doc);
    return (await pdfParse(buf)).text;
}

const ISO_LEAKS = [/ISO\s*27001/i, /Annex\s*A/i, /\b93\b/];

describe('de-ISO PDF exports — non-ISO framework (SOC 2)', () => {
    beforeEach(() => getSoAMock.mockReset());

    it('Audit Readiness names SOC 2 and leaks no ISO literals', async () => {
        getSoAMock.mockResolvedValue(dto({}));
        const text = await pdfText(await generateAuditReadinessPdf(ctx, { framework: 'SOC2' }));
        expect(text).toContain('SOC 2');
        for (const rx of ISO_LEAKS) expect(text).not.toMatch(rx);
    });

    it('Gap Analysis names SOC 2 and leaks no ISO literals', async () => {
        getSoAMock.mockResolvedValue(dto({}));
        const text = await pdfText(await generateGapAnalysisPdf(ctx, { framework: 'SOC2' }));
        expect(text).toContain('SOC 2');
        for (const rx of ISO_LEAKS) expect(text).not.toMatch(rx);
    });

    it('forwards the selected framework to getSoA', async () => {
        getSoAMock.mockResolvedValue(dto({}));
        await generateAuditReadinessPdf(ctx, { framework: 'SOC2' });
        expect(getSoAMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ framework: 'SOC2' }),
        );
    });
});

describe('ISO framework still reads as ISO', () => {
    beforeEach(() => getSoAMock.mockReset());

    it('Audit Readiness keeps Annex A / Statement of Applicability for ISO', async () => {
        getSoAMock.mockResolvedValue(
            dto({ framework: 'ISO27001', frameworkName: 'ISO 27001:2022', isIsoFamily: true }),
        );
        const text = await pdfText(await generateAuditReadinessPdf(ctx, { framework: 'ISO27001' }));
        expect(text).toMatch(/Statement of Applicability/i);
        expect(text).toMatch(/Annex A/i);
    });
});
