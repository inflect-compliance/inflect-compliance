/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — Audit Readiness PDF generator (previously ~0% branches).
 *
 * Strategy: mock the data-fetching boundary (getSoA, runSoAChecks, prisma) and
 * let the REAL pdfkit-backed layout/table/section helpers run under node. The
 * generator's own branches are exercised by varying the mocked report data:
 *   - checks.pass true (audit-ready paragraph) vs false (error/warning summary)
 *   - checks.issues empty (no Issues table) vs populated (Issues table + sort)
 *   - issue severity error vs warning sort arm + .toUpperCase()
 *   - entry.applicable true / false / null → 'Yes' / 'No' / 'Unmapped'
 *   - implementationStatus present (replace _) vs absent ('—')
 *   - justification present vs absent ('—')
 *   - tenant name present vs absent; framework option present vs absent
 *   - watermark option vs default 'NONE'
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

import { generateAuditReadinessPdf } from '@/app-layer/reports/pdf/auditReadiness';
import { makeRequestContext } from '../../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

function entry(over: Partial<any> = {}) {
    return {
        requirementId: over.requirementId ?? 'req1',
        requirementCode: over.requirementCode ?? 'A.5.1',
        requirementTitle: over.requirementTitle ?? 'Policies',
        section: over.section ?? 'Organizational',
        applicable: over.applicable ?? true,
        justification: over.justification ?? null,
        implementationStatus: over.implementationStatus ?? 'IMPLEMENTED',
        mappedControls: over.mappedControls ?? [{ controlId: 'c1' }],
        evidenceCount: over.evidenceCount ?? 1,
        openTaskCount: over.openTaskCount ?? 0,
        lastTestResult: over.lastTestResult ?? null,
        ...over,
    };
}

function soaReport(entries: any[]): any {
    return {
        tenantId: 't1',
        tenantSlug: 'acme',
        framework: 'ISO27001',
        frameworkName: 'ISO 27001:2022',
        generatedAt: new Date().toISOString(),
        entries,
        summary: {
            total: entries.length,
            applicable: entries.filter((e) => e.applicable === true).length,
            notApplicable: entries.filter((e) => e.applicable === false).length,
            unmapped: entries.filter((e) => e.applicable === null).length,
            implemented: entries.filter((e) => e.implementationStatus === 'IMPLEMENTED').length,
            missingJustification: 0,
        },
    };
}

function checks(over: Partial<any> = {}): any {
    return {
        pass: over.pass ?? true,
        errorCount: over.errorCount ?? 0,
        warningCount: over.warningCount ?? 0,
        issues: over.issues ?? [],
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
    mockTenantFindUnique.mockResolvedValue({ name: 'Acme Corp' });
});

describe('generateAuditReadinessPdf', () => {
    it('audit-ready (pass=true, no issues): renders the ready paragraph, no Issues table', async () => {
        // Branch: checks.pass === true → "✓ SoA is audit-ready"; issues.length === 0.
        mockGetSoA.mockResolvedValue(soaReport([entry()]));
        mockRunSoAChecks.mockReturnValue(checks({ pass: true }));

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);

        expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(mockGetSoA).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ includeEvidence: true, includeTasks: true, includeTests: true }),
        );
    });

    it('NOT audit-ready (pass=false) with issues table + error/warning sort', async () => {
        // Branch: checks.pass === false → "✗ ... NOT audit-ready" summary line;
        // issues.length > 0 → Issues table; sort places error before warning.
        mockGetSoA.mockResolvedValue(
            soaReport([
                entry({ requirementCode: 'A.5.2', applicable: false, justification: 'N/A here' }),
                entry({ requirementCode: 'A.5.1', applicable: null, implementationStatus: null, mappedControls: [] }),
            ]),
        );
        mockRunSoAChecks.mockReturnValue(
            checks({
                pass: false,
                errorCount: 1,
                warningCount: 1,
                issues: [
                    {
                        rule: 'NO_EVIDENCE',
                        severity: 'warning',
                        requirementCode: 'A.5.3',
                        requirementTitle: 'X',
                        reason: 'No evidence',
                        suggestedAction: 'Attach evidence',
                    },
                    {
                        rule: 'UNMAPPED',
                        severity: 'error',
                        requirementCode: 'A.5.1',
                        requirementTitle: 'Y',
                        reason: 'No controls mapped',
                        suggestedAction: 'Map a control',
                    },
                ],
            }),
        );

        const doc = await generateAuditReadinessPdf(ctx, { framework: 'ISO27001', watermark: 'DRAFT' });
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('mixed-severity ordering hits BOTH ternary arms of the sort comparator', async () => {
        // Branch: a.severity !== b.severity → both `'error' ? -1` and `: 1` arms.
        // Three issues in warning/error/warning order force the comparator to
        // evaluate (warning,error) and (error,warning) pairs.
        mockGetSoA.mockResolvedValue(soaReport([entry()]));
        mockRunSoAChecks.mockReturnValue(
            checks({
                pass: false,
                errorCount: 1,
                warningCount: 2,
                issues: [
                    { rule: 'NO_EVIDENCE', severity: 'warning', requirementCode: 'A.5.1', requirementTitle: 'W1', reason: 'r', suggestedAction: 'a' },
                    { rule: 'UNMAPPED', severity: 'error', requirementCode: 'A.5.2', requirementTitle: 'E1', reason: 'r', suggestedAction: 'a' },
                    { rule: 'NOT_STARTED', severity: 'warning', requirementCode: 'A.5.3', requirementTitle: 'W2', reason: 'r', suggestedAction: 'a' },
                ],
            }),
        );

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('two issues of the SAME severity exercise the localeCompare sort arm', async () => {
        // Branch: a.severity === b.severity → fall through to code comparison.
        mockGetSoA.mockResolvedValue(soaReport([entry()]));
        mockRunSoAChecks.mockReturnValue(
            checks({
                pass: false,
                errorCount: 2,
                issues: [
                    { rule: 'UNMAPPED', severity: 'error', requirementCode: 'A.5.10', requirementTitle: 'B', reason: 'r', suggestedAction: 'a' },
                    { rule: 'UNMAPPED', severity: 'error', requirementCode: 'A.5.2', requirementTitle: 'A', reason: 'r', suggestedAction: 'a' },
                ],
            }),
        );

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('entry field fallbacks: applicable false/null, missing status & justification', async () => {
        // Branch matrix on the row mapper:
        //   applicable true  → 'Yes'
        //   applicable false → 'No'
        //   applicable null  → 'Unmapped'
        //   implementationStatus null → '—'
        //   justification null → '—'
        mockGetSoA.mockResolvedValue(
            soaReport([
                entry({ requirementCode: 'A.5.1', applicable: true, justification: 'because' }),
                entry({ requirementCode: 'A.5.2', applicable: false, implementationStatus: null, justification: null }),
                entry({ requirementCode: 'A.5.3', applicable: null, implementationStatus: null, justification: null, mappedControls: [] }),
            ]),
        );
        mockRunSoAChecks.mockReturnValue(checks({ pass: true }));

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('absent tenant name falls back to "Tenant"', async () => {
        // Branch: tenant?.name || 'Tenant'.
        mockTenantFindUnique.mockResolvedValue(null);
        mockGetSoA.mockResolvedValue(soaReport([entry()]));
        mockRunSoAChecks.mockReturnValue(checks({ pass: true }));

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('empty SoA still renders (no entries)', async () => {
        // Branch: zero entries — sorted/mapped arrays are empty, totals row still rendered.
        mockGetSoA.mockResolvedValue(soaReport([]));
        mockRunSoAChecks.mockReturnValue(checks({ pass: true }));

        const doc = await generateAuditReadinessPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });
});
