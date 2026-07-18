/**
 * RQ-8 — risk correlation & portfolio modelling.
 *
 * Pairwise correlations let the Monte Carlo engine (RQ-3) produce realistic
 * portfolio tails: positively-correlated risks co-materialise, widening
 * VaR; independent sampling underestimates it. Stored normalised
 * (riskAId < riskBId); the engine consumes an NxN matrix.
 *
 * `validatePSD` (eigenvalue check) is pure — unit-testable. Cholesky +
 * correlated sampling live in `monte-carlo.ts`.
 *
 * @module usecases/risk-correlation
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest } from '@/lib/errors/types';
import { assertCanRead, assertCanWrite } from '../policies/common';

// ── Pure PSD validation (Jacobi eigenvalues for symmetric matrices) ────

/** Eigenvalues of a symmetric matrix via cyclic Jacobi rotations. */
function symmetricEigenvalues(input: number[][]): number[] {
    const n = input.length;
    const a = input.map((row) => row.slice());
    for (let sweep = 0; sweep < 100; sweep++) {
        let off = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
        if (off < 1e-18) break;
        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                if (Math.abs(a[p][q]) < 1e-15) continue;
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < n; k++) {
                    const akp = a[k][p], akq = a[k][q];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < n; k++) {
                    const apk = a[p][k], aqk = a[q][k];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
            }
        }
    }
    return Array.from({ length: n }, (_, i) => a[i][i]);
}

export interface PSDResult { valid: boolean; minEigenvalue: number }

/**
 * Cholesky (used to correlate the Monte Carlo draws) needs a STRICTLY
 * positive-definite matrix, not merely positive-SEMI-definite. A
 * rank-deficient matrix (e.g. a ±1.0 coefficient making two rows
 * linearly dependent) has a minimum eigenvalue at ~0: it passes the
 * PSD tolerance below but its Cholesky pivot hits `d <= 1e-12` and the
 * sim silently drops the correlations. `PD_EPSILON` is the margin the
 * correlations page uses to WARN before that happens — a minimum
 * eigenvalue at or below it means "not reliably positive-definite".
 */
export const PD_EPSILON = 1e-8;

/** True when the matrix is strictly positive-definite (Cholesky-safe). */
export function isPositiveDefinite(minEigenvalue: number): boolean {
    return minEigenvalue > PD_EPSILON;
}

/** A correlation matrix must be positive semi-definite for Cholesky. */
export function validatePSD(matrix: number[][]): PSDResult {
    if (matrix.length === 0) return { valid: true, minEigenvalue: 0 };
    const eig = symmetricEigenvalues(matrix);
    const minEigenvalue = Math.min(...eig);
    return { valid: minEigenvalue >= -1e-8, minEigenvalue };
}

// ── CRUD ──────────────────────────────────────────────────────────────

/** Normalise an unordered pair so riskAId < riskBId (one row per pair). */
function norm(a: string, b: string): [string, string] { return a < b ? [a, b] : [b, a]; }

export async function setCorrelation(
    ctx: RequestContext,
    input: { riskAId: string; riskBId: string; coefficient: number; rationale?: string; source?: 'MANUAL' | 'AUTO_SUGGESTED' },
) {
    assertCanWrite(ctx);
    if (input.riskAId === input.riskBId) throw badRequest('A risk cannot correlate with itself');
    if (input.coefficient < -1 || input.coefficient > 1) throw badRequest('Coefficient must be in [-1, 1]');
    const [riskAId, riskBId] = norm(input.riskAId, input.riskBId);
    return runInTenantContext(ctx, (db) =>
        db.riskCorrelation.upsert({
            where: { tenantId_riskAId_riskBId: { tenantId: ctx.tenantId, riskAId, riskBId } },
            create: { tenantId: ctx.tenantId, riskAId, riskBId, coefficient: input.coefficient, rationale: input.rationale ?? null, source: input.source ?? 'MANUAL', createdByUserId: ctx.userId },
            update: { coefficient: input.coefficient, rationale: input.rationale ?? null, source: input.source ?? 'MANUAL' },
        }),
    );
}

export async function removeCorrelation(ctx: RequestContext, riskAId: string, riskBId: string) {
    assertCanWrite(ctx);
    const [a, b] = norm(riskAId, riskBId);
    await runInTenantContext(ctx, (db) => db.riskCorrelation.deleteMany({ where: { tenantId: ctx.tenantId, riskAId: a, riskBId: b } }));
}

export interface CorrelationMatrixData {
    riskIds: string[];
    riskTitles: string[];
    matrix: number[][];
    isPositiveSemiDefinite: boolean;
    /** Smallest eigenvalue — surfaced so the page can distinguish a
     *  strictly positive-definite matrix from a merely PSD (borderline)
     *  one that Cholesky will drop at sim time. */
    minEigenvalue: number;
    /** True only when strictly positive-definite (`minEigenvalue > PD_EPSILON`).
     *  A PSD-but-not-PD matrix (this false, `isPositiveSemiDefinite` true)
     *  is the case the sim silently drops. */
    isPositiveDefinite: boolean;
}

/** Build the NxN correlation matrix over all active risks (diagonal 1, missing 0). */
export async function getCorrelationMatrix(ctx: RequestContext): Promise<CorrelationMatrixData> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const risks = await db.risk.findMany({ where: { tenantId: ctx.tenantId, deletedAt: null }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' }, take: 500 });
        const pairs = await db.riskCorrelation.findMany({ where: { tenantId: ctx.tenantId }, select: { riskAId: true, riskBId: true, coefficient: true }, take: 50000 });
        const idx = new Map(risks.map((r, i) => [r.id, i]));
        const n = risks.length;
        const matrix: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
        for (const p of pairs) {
            const i = idx.get(p.riskAId); const j = idx.get(p.riskBId);
            if (i == null || j == null) continue;
            matrix[i][j] = p.coefficient; matrix[j][i] = p.coefficient;
        }
        const psd = validatePSD(matrix);
        return {
            riskIds: risks.map((r) => r.id),
            riskTitles: risks.map((r) => r.title),
            matrix,
            isPositiveSemiDefinite: psd.valid,
            minEigenvalue: psd.minEigenvalue,
            isPositiveDefinite: isPositiveDefinite(psd.minEigenvalue),
        };
    });
}

// ── Auto-suggestion (pure core + DB loader) ────────────────────────────

export interface SuggestionInput { riskId: string; assetIds: string[]; controlIds: string[] }
export interface CorrelationSuggestion { riskAId: string; riskBId: string; suggestedCoefficient: number; reason: string }

/** Pure: suggest correlations from shared assets/controls. Cap 0.8. */
export function computeSuggestions(risks: SuggestionInput[]): CorrelationSuggestion[] {
    const out: CorrelationSuggestion[] = [];
    for (let i = 0; i < risks.length; i++) {
        for (let j = i + 1; j < risks.length; j++) {
            const a = risks[i]; const b = risks[j];
            const sharedAssets = a.assetIds.filter((x) => b.assetIds.includes(x));
            const sharedControls = a.controlIds.filter((x) => b.controlIds.includes(x));
            if (sharedAssets.length === 0 && sharedControls.length === 0) continue;
            let coef = 0;
            const reasons: string[] = [];
            if (sharedAssets.length > 0) { coef = Math.max(coef, 0.3 + 0.1 * sharedAssets.length); reasons.push(`share ${sharedAssets.length} asset(s)`); }
            if (sharedControls.length > 0) { coef = Math.max(coef, 0.2 + 0.1 * sharedControls.length); reasons.push(`share ${sharedControls.length} control(s)`); }
            const [riskAId, riskBId] = norm(a.riskId, b.riskId);
            out.push({ riskAId, riskBId, suggestedCoefficient: Math.min(0.8, Math.round(coef * 100) / 100), reason: reasons.join('; ') });
        }
    }
    return out;
}

export async function suggestCorrelations(ctx: RequestContext): Promise<CorrelationSuggestion[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const risks = await db.risk.findMany({ where: { tenantId: ctx.tenantId, deletedAt: null }, select: { id: true }, take: 500 });
        const ids = risks.map((r) => r.id);
        if (ids.length < 2) return [];
        const [assetLinks, controlLinks] = await Promise.all([
            db.assetRiskLink.findMany({ where: { tenantId: ctx.tenantId, riskId: { in: ids } }, select: { riskId: true, assetId: true }, take: 50000 }),
            db.riskControl.findMany({ where: { tenantId: ctx.tenantId, riskId: { in: ids } }, select: { riskId: true, controlId: true }, take: 50000 }),
        ]);
        const byRisk = new Map<string, SuggestionInput>(ids.map((id) => [id, { riskId: id, assetIds: [], controlIds: [] }]));
        for (const l of assetLinks) byRisk.get(l.riskId)?.assetIds.push(l.assetId);
        for (const l of controlLinks) byRisk.get(l.riskId)?.controlIds.push(l.controlId);
        return computeSuggestions(Array.from(byRisk.values()));
    });
}
