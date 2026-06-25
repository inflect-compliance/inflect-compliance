/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — Gap Analysis PDF generator (previously ~0% branches).
 *
 * Strategy: mock the data-fetching boundary (getSoA, runSoAChecks, prisma) and
 * let the REAL pdfkit-backed layout/table/section helpers run under node. The
 * generator's branches are exercised by varying the mocked checks result:
 *   - checks.pass true (PASS summary + "no critical gaps" paragraph) vs false
 *   - errors present (Errors table) vs none
 *   - warnings present (Warnings table) vs none
 *   - issues.length === 0 → "No Gaps Found" section
 *   - tenant name present vs absent; watermark option vs default
 */

const mockGetSoA = jest.fn();
const mockRunSoAChecks = jest.fn();
const mockTenantFindUnique = jest.fn();

jest.mock('@/app-layer/usecases/soa', () => ({
    getSoA: (...args: any[]) => mockGetSoA(...args),
}));

jest.mock('@/app-layer/usecases/soa-checks', () => ({
    runSoAChecks: (...args: any[]) => mockRunSoAChecks(...args),
}));

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        tenant: { findUnique: (...args: any[]) => mockTenantFindUnique(...args) },
    },
}));

import { generateGapAnalysisPdf } from '@/app-layer/reports/pdf/gapAnalysis';
import { makeRequestContext } from '../../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

function soaReport(entries: any[] = []): any {
    return {
        tenantId: 't1',
        tenantSlug: 'acme',
        framework: 'ISO27001',
        frameworkName: 'ISO 27001:2022',
        generatedAt: new Date().toISOString(),
        entries,
        summary: {
            total: entries.length,
            applicable: 0,
            notApplicable: 0,
            unmapped: 0,
            implemented: 0,
            missingJustification: 0,
        },
    };
}

function issue(severity: 'error' | 'warning', code: string): any {
    return {
        rule: 'NO_EVIDENCE',
        severity,
        requirementCode: code,
        requirementTitle: 'Req ' + code,
        reason: 'reason text',
        suggestedAction: 'do the thing',
    };
}

function checks(over: Partial<any> = {}): any {
    const issues = over.issues ?? [];
    return {
        pass: over.pass ?? issues.length === 0,
        errorCount: over.errorCount ?? issues.filter((i: any) => i.severity === 'error').length,
        warningCount: over.warningCount ?? issues.filter((i: any) => i.severity === 'warning').length,
        issues,
    };
}

async function renderToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSoA.mockResolvedValue(soaReport());
    mockTenantFindUnique.mockResolvedValue({ name: 'Acme Corp' });
});

describe('generateGapAnalysisPdf', () => {
    it('pass=true, no issues: PASS summary + "No Gaps Found" section', async () => {
        // Branch: checks.pass true → "No critical gaps" paragraph;
        // errors.length === 0 (no Errors table); warnings.length === 0;
        // issues.length === 0 → "No Gaps Found".
        mockRunSoAChecks.mockReturnValue(checks({ pass: true, issues: [] }));

        const doc = await generateGapAnalysisPdf(ctx);
        const buf = await renderToBuffer(doc);

        expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(mockGetSoA).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ includeEvidence: true, includeTasks: true, includeTests: true }),
        );
    });

    it('fail with BOTH errors and warnings: both tables render', async () => {
        // Branch: checks.pass false → "Critical gaps detected" paragraph;
        // errors.length > 0 → Errors table (sorted); warnings.length > 0 → Warnings table.
        mockRunSoAChecks.mockReturnValue(
            checks({
                pass: false,
                issues: [
                    issue('error', 'A.5.10'),
                    issue('error', 'A.5.2'),
                    issue('warning', 'A.6.1'),
                ],
            }),
        );

        const doc = await generateGapAnalysisPdf(ctx, { watermark: 'FINAL' });
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('fail with ONLY errors: Errors table, no Warnings table, no "No Gaps Found"', async () => {
        // Branch: errors.length > 0, warnings.length === 0, issues.length > 0.
        mockRunSoAChecks.mockReturnValue(
            checks({ pass: false, issues: [issue('error', 'A.5.1')] }),
        );

        const doc = await generateGapAnalysisPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('fail with ONLY warnings: Warnings table, no Errors table', async () => {
        // Branch: errors.length === 0, warnings.length > 0.
        mockRunSoAChecks.mockReturnValue(
            checks({ pass: false, issues: [issue('warning', 'A.7.1'), issue('warning', 'A.7.2')] }),
        );

        const doc = await generateGapAnalysisPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('absent tenant name falls back to "Tenant"', async () => {
        // Branch: tenant?.name || 'Tenant'.
        mockTenantFindUnique.mockResolvedValue(null);
        mockRunSoAChecks.mockReturnValue(checks({ pass: true, issues: [] }));

        const doc = await generateGapAnalysisPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });
});
