/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-B coverage — Risk Register PDF generator (previously ~0% branches).
 *
 * Strategy: mock the data-fetching boundary (getReports, getRiskMatrixConfig,
 * prisma) and let the REAL pdfkit-backed layout/table/section helpers run
 * under node. We then exercise the generator's own branches by varying the
 * input data shape:
 *   - empty vs populated register (avgScore "0" branch, totals row)
 *   - present vs absent optional fields (threat / treatment / owner / controls → '—')
 *   - tenant-name present vs absent (tenant?.name || 'Tenant')
 *   - watermark option present vs default 'NONE'
 *   - band-bucket counting across the configured matrix bands
 *   - untreated counting + score-desc/title sort ordering
 */

const mockGetReports = jest.fn();
const mockGetRiskMatrixConfig = jest.fn();
const mockTenantFindUnique = jest.fn();

jest.mock('@/app-layer/usecases/report', () => ({
    getReports: (...args: any[]) => mockGetReports(...args),
}));

jest.mock('@/app-layer/usecases/risk-matrix-config', () => ({
    getRiskMatrixConfig: (...args: any[]) => mockGetRiskMatrixConfig(...args),
}));

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        tenant: { findUnique: (...args: any[]) => mockTenantFindUnique(...args) },
    },
}));

import { generateRiskRegisterPdf } from '@/app-layer/reports/pdf/riskRegister';
import { makeRequestContext } from '../../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

// Canonical two-band matrix (ascending by score, as the source expects).
const BANDS = [
    { name: 'Low', minScore: 1, maxScore: 7, color: '#22c55e' },
    { name: 'High', minScore: 8, maxScore: 25, color: '#ef4444' },
];

function risk(over: Partial<any> = {}) {
    return {
        id: over.id ?? 'r1',
        title: over.title ?? 'Risk A',
        threat: over.threat ?? 'Threat',
        likelihood: over.likelihood ?? 3,
        impact: over.impact ?? 4,
        score: over.score ?? 12,
        treatment: over.treatment ?? 'Mitigate',
        owner: over.owner ?? 'Alice',
        controls: over.controls ?? 'A.5.1',
        ...over,
    };
}

/** Render a real PDFKit doc to a Buffer so we assert non-empty, no-throw output. */
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
    mockGetRiskMatrixConfig.mockResolvedValue({ bands: BANDS });
    mockTenantFindUnique.mockResolvedValue({ name: 'Acme Corp' });
});

describe('generateRiskRegisterPdf', () => {
    it('populated register: produces a non-empty PDF and counts bands/untreated', async () => {
        // Branch: multiple risks across both bands; some untreated; all optional
        // fields present; score-desc + title sort exercised.
        mockGetReports.mockResolvedValue({
            riskRegister: [
                risk({ id: 'a', title: 'Bravo', score: 12, treatment: 'Mitigate' }),
                risk({ id: 'b', title: 'Alpha', score: 12, treatment: 'Untreated' }),
                risk({ id: 'c', title: 'Charlie', score: 4, treatment: 'Accept' }),
                risk({ id: 'd', title: 'Delta', score: 20, treatment: 'Untreated' }),
            ],
        });

        const doc = await generateRiskRegisterPdf(ctx);
        const buf = await renderToBuffer(doc);

        expect(buf.length).toBeGreaterThan(0);
        expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
        // Both data boundaries were consulted.
        expect(mockGetReports).toHaveBeenCalledWith(ctx);
        expect(mockGetRiskMatrixConfig).toHaveBeenCalledWith(ctx);
    });

    it('empty register: hits the avgScore "0" branch and totals with no rows', async () => {
        // Branch: totalRisks === 0 → avgScore falls to '0', no rows, 0 untreated.
        mockGetReports.mockResolvedValue({ riskRegister: [] });

        const doc = await generateRiskRegisterPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('absent optional fields: every "|| —" fallback branch is taken', async () => {
        // Branch: threat / treatment / owner / controls all falsy → '—' fallback.
        mockGetReports.mockResolvedValue({
            riskRegister: [
                risk({
                    id: 'x',
                    title: 'Bare',
                    threat: '',
                    treatment: '',
                    owner: '',
                    controls: '',
                    score: 5,
                }),
            ],
        });

        const doc = await generateRiskRegisterPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('absent tenant name: falls back to "Tenant"', async () => {
        // Branch: tenant?.name || 'Tenant' — tenant row missing.
        mockTenantFindUnique.mockResolvedValue(null);
        mockGetReports.mockResolvedValue({ riskRegister: [risk()] });

        const doc = await generateRiskRegisterPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('watermark option DRAFT is threaded through meta', async () => {
        // Branch: options?.watermark provided (vs the default 'NONE').
        mockGetReports.mockResolvedValue({ riskRegister: [risk()] });

        const doc = await generateRiskRegisterPdf(ctx, { watermark: 'DRAFT' });
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });

    it('single band matrix still renders the band bucket', async () => {
        // Branch: matrix with a single band — bandCounts maps over one entry.
        mockGetRiskMatrixConfig.mockResolvedValue({
            bands: [{ name: 'All', minScore: 1, maxScore: 25, color: '#000' }],
        });
        mockGetReports.mockResolvedValue({ riskRegister: [risk({ score: 9 })] });

        const doc = await generateRiskRegisterPdf(ctx);
        const buf = await renderToBuffer(doc);
        expect(buf.length).toBeGreaterThan(0);
    });
});
