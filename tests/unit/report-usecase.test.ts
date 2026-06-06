/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/report.ts`.
 *
 * Roadmap Q3 supporting domain. Single-function file that projects
 * controls + risks into the SoA + risk-register report payload.
 * Mocks ReportRepository, tracing helper, observability logger,
 * and runInTenantContext.
 *
 * Covers:
 *   - SoA projection — annexId-vs-id fallback for controlId,
 *     applicable boolean from applicability=APPLICABLE, evidence
 *     count + approvedEvidence count + hasOverdue derivation
 *     (nextReviewDate < now).
 *   - Risk register — treatment "Untreated" fallback when null,
 *     owner "Unassigned" fallback, controls projection (annexId
 *     vs name fallback per control).
 *   - Empty arrays on both sides produce { soa: [], riskRegister: [] }.
 *   - Read-gate enforcement.
 */

const mockDb = {} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/lib/observability/tracing', () => ({
    traceUsecase: jest.fn(async (_name: string, _ctx: any, fn: () => any) => fn()),
}));

jest.mock('@/lib/observability/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/app-layer/repositories/ReportRepository', () => ({
    ReportRepository: {
        getSOAData: jest.fn(),
        getRiskRegisterData: jest.fn(),
    },
}));

import { ReportRepository } from '@/app-layer/repositories/ReportRepository';
import { getReports } from '@/app-layer/usecases/report';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const readerCtx = makeRequestContext('READER');

// ─── SoA projection ────────────────────────────────────────────────

describe('getReports — SoA projection', () => {
    it('uses annexId as controlId when present, falls back to id when null', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([
            { id: 'c-1', annexId: 'A.5.1', name: 'X', applicability: 'APPLICABLE', status: 'IMPLEMENTED', effectiveness: 'HIGH', evidence: [], lastTested: null, reviewCadence: null },
            { id: 'c-2', annexId: null, name: 'Y', applicability: 'NOT_APPLICABLE', status: 'NOT_STARTED', effectiveness: null, evidence: [], lastTested: null, reviewCadence: null },
        ]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([]);

        const res = await getReports(readerCtx);

        expect(res.soa[0].controlId).toBe('A.5.1');
        expect(res.soa[1].controlId).toBe('c-2');
    });

    it('derives applicable boolean from applicability === APPLICABLE', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([
            { id: 'c-1', annexId: 'A.5.1', name: 'X', applicability: 'APPLICABLE', status: 'X', effectiveness: null, evidence: [], lastTested: null, reviewCadence: null },
            { id: 'c-2', annexId: 'A.5.2', name: 'Y', applicability: 'NOT_APPLICABLE', status: 'X', effectiveness: null, evidence: [], lastTested: null, reviewCadence: null },
        ]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([]);

        const res = await getReports(readerCtx);

        expect(res.soa[0].applicable).toBe(true);
        expect(res.soa[1].applicable).toBe(false);
    });

    it('counts evidence + approvedEvidence + derives hasOverdue from nextReviewDate < now', async () => {
        const past = new Date(Date.now() - 86400000);
        const future = new Date(Date.now() + 86400000);
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([
            {
                id: 'c-1', annexId: 'A.5', name: 'X', applicability: 'APPLICABLE', status: 'OK', effectiveness: null,
                evidence: [
                    { status: 'APPROVED', nextReviewDate: past },
                    { status: 'APPROVED', nextReviewDate: future },
                    { status: 'DRAFT', nextReviewDate: null },
                ],
                lastTested: null, reviewCadence: null,
            },
        ]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([]);

        const res = await getReports(readerCtx);

        expect(res.soa[0].evidenceCount).toBe(3);
        expect(res.soa[0].approvedEvidence).toBe(2);
        expect(res.soa[0].hasOverdue).toBe(true);
    });

    it('hasOverdue is false when no evidence row has nextReviewDate in the past', async () => {
        const future = new Date(Date.now() + 86400000);
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([
            {
                id: 'c-1', annexId: 'A.5', name: 'X', applicability: 'APPLICABLE', status: 'OK', effectiveness: null,
                evidence: [{ status: 'APPROVED', nextReviewDate: future }, { status: 'DRAFT', nextReviewDate: null }],
                lastTested: null, reviewCadence: null,
            },
        ]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([]);

        const res = await getReports(readerCtx);

        expect(res.soa[0].hasOverdue).toBe(false);
    });
});

// ─── Risk register projection ──────────────────────────────────────

describe('getReports — risk register projection', () => {
    it('falls back to "Untreated" + "Unassigned" when treatment/owner are null', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([
            {
                id: 'r-1', title: 'T', threat: 'h', vulnerability: 'v',
                likelihood: 3, impact: 3, inherentScore: 9,
                treatment: null, treatmentOwner: null, targetDate: null, controls: [],
            },
        ]);

        const res = await getReports(readerCtx);

        expect(res.riskRegister[0].treatment).toBe('Untreated');
        expect(res.riskRegister[0].owner).toBe('Unassigned');
    });

    it('uses treatment + treatmentOwner verbatim when present', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([
            {
                id: 'r-1', title: 'T', threat: 'h', vulnerability: 'v',
                likelihood: 3, impact: 3, inherentScore: 9,
                treatment: 'MITIGATE', treatmentOwner: 'sec-team', targetDate: null, controls: [],
            },
        ]);

        const res = await getReports(readerCtx);

        expect(res.riskRegister[0].treatment).toBe('MITIGATE');
        expect(res.riskRegister[0].owner).toBe('sec-team');
    });

    it('joins control names with annexId fallback per control', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([
            {
                id: 'r-1', title: 'T', threat: '', vulnerability: '',
                likelihood: 1, impact: 1, inherentScore: 1,
                treatment: null, treatmentOwner: null, targetDate: null,
                controls: [
                    { control: { annexId: 'A.5.1', name: 'X' } },
                    { control: { annexId: null, name: 'Y' } },
                ],
            },
        ]);

        const res = await getReports(readerCtx);

        expect(res.riskRegister[0].controls).toBe('A.5.1, Y');
    });
});

// ─── Empty payload + auth ──────────────────────────────────────────

describe('getReports — empty + auth', () => {
    it('returns { soa: [], riskRegister: [] } on empty repos', async () => {
        (ReportRepository.getSOAData as jest.Mock).mockResolvedValue([]);
        (ReportRepository.getRiskRegisterData as jest.Mock).mockResolvedValue([]);

        const res = await getReports(readerCtx);

        expect(res).toEqual({ soa: [], riskRegister: [] });
    });

    it('rejects when caller lacks read permission', async () => {
        const noReadCtx = makeRequestContext('READER', {
            permissions: { canRead: false, canWrite: false, canAdmin: false, canAudit: false, canExport: false },
        });
        await expect(getReports(noReadCtx)).rejects.toBeDefined();
    });
});
