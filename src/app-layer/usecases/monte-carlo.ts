/**
 * RQ-3 — Monte Carlo simulation engine.
 *
 * Samples each risk's ALE from its FAIR PERT distributions (RQ-1) across
 * thousands of iterations to produce a portfolio loss distribution,
 * percentiles / VaR, a loss-exceedance curve, and per-risk contribution —
 * the stochastic analysis boards + actuaries expect.
 *
 * The simulation MATH is pure (`simulatePortfolio`) — unit-testable with a
 * seed, no DB. `runSimulation` is the DB wrapper (load risks → simulate →
 * persist a RiskSimulationRun).
 *
 * @module usecases/monte-carlo
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { Prisma } from '@prisma/client';
import { assertCanRead } from '../policies/common';
import {
    seededRng,
    sampleFairALE,
    pointToPert,
    resolveALE,
    type FairDistributions,
    type PertDistribution,
} from './fair-calculator';

export const MAX_ITERATIONS = 100_000;
export const DEFAULT_ITERATIONS = 10_000;

/** Mulberry32 seeded PRNG (re-exported from the FAIR core for reproducibility). */
export const createPRNG = seededRng;

/**
 * Triangular inverse-CDF sample of a PERT triple from a uniform variate.
 * u=0 → min, u=1 → max, u at the mode-CDF → mode. Used for point-estimate
 * risks + the RQ-8 correlated-sampling path (uniform from Cholesky).
 */
export function samplePert(dist: PertDistribution, u: number): number {
    const { min, mode, max } = dist;
    if (max <= min) return min;
    if (u <= 0) return min;
    if (u >= 1) return max;
    const fc = (mode - min) / (max - min);
    if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export interface SimRisk {
    id: string;
    title: string;
    /** Point ALE (resolveALE) — used when `distributions` is absent. */
    pointAle: number;
    /** Full PERT distributions (from fairInputsJson) — preferred. */
    distributions?: FairDistributions;
}

export interface SimulationConfig {
    iterations?: number;
    confidenceLevels?: number[];
    seed?: number;
}

export interface SimulationResult {
    portfolioAle: { mean: number; median: number; p90: number; p95: number; p99: number; stdDev: number; min: number; max: number };
    perRisk: Array<{ riskId: string; title: string; aleMean: number; aleP95: number; contribution: number }>;
    lossExceedanceCurve: Array<{ threshold: number; probability: number }>;
    convergenceDelta: number;
    iterationsRun: number;
    executionMs: number;
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
}

/** Pure Monte Carlo over a fixed risk set. Deterministic for a given seed. */
export function simulatePortfolio(risks: SimRisk[], config: SimulationConfig = {}): SimulationResult {
    const start = Date.now();
    const iterations = Math.min(MAX_ITERATIONS, Math.max(1, config.iterations ?? DEFAULT_ITERATIONS));
    const rng = createPRNG(config.seed ?? 1);

    if (risks.length === 0) {
        return {
            portfolioAle: { mean: 0, median: 0, p90: 0, p95: 0, p99: 0, stdDev: 0, min: 0, max: 0 },
            perRisk: [], lossExceedanceCurve: [], convergenceDelta: 0, iterationsRun: iterations, executionMs: Date.now() - start,
        };
    }

    const portfolioLosses = new Float64Array(iterations);
    const perRiskSum = new Array(risks.length).fill(0);
    // Per-risk samples kept only for modest portfolios (for p95); else mean-only.
    const keepPerRisk = risks.length <= 200;
    const perRiskSamples: number[][] = keepPerRisk ? risks.map(() => []) : [];
    let runningSum = 0;
    const tail = Math.min(1000, iterations);
    let tailSum = 0;

    for (let i = 0; i < iterations; i++) {
        let loss = 0;
        for (let r = 0; r < risks.length; r++) {
            const risk = risks[r];
            const ale = risk.distributions
                ? sampleFairALE(risk.distributions, rng)
                : samplePert(pointToPert(risk.pointAle, 0.2), rng());
            loss += ale;
            perRiskSum[r] += ale;
            if (keepPerRisk) perRiskSamples[r].push(ale);
        }
        portfolioLosses[i] = loss;
        runningSum += loss;
        if (i >= iterations - tail) tailSum += loss;
    }

    const sorted = Array.from(portfolioLosses).sort((a, b) => a - b);
    const mean = runningSum / iterations;
    const variance = sorted.reduce((s, v) => s + (v - mean) * (v - mean), 0) / iterations;
    const stdDev = Math.sqrt(variance);

    const perRisk = risks.map((risk, r) => {
        const aleMean = perRiskSum[r] / iterations;
        let aleP95 = aleMean;
        if (keepPerRisk) {
            const s = perRiskSamples[r].sort((a, b) => a - b);
            aleP95 = percentile(s, 0.95);
        }
        return { riskId: risk.id, title: risk.title, aleMean, aleP95, contribution: mean > 0 ? aleMean / mean : 0 };
    }).sort((a, b) => b.aleMean - a.aleMean);

    // Loss exceedance curve — 20 thresholds spanning [p50, max].
    const lossExceedanceCurve: Array<{ threshold: number; probability: number }> = [];
    const lo = percentile(sorted, 0.5);
    const hi = sorted[sorted.length - 1];
    const steps = 20;
    for (let k = 0; k <= steps; k++) {
        const threshold = lo + ((hi - lo) * k) / steps;
        // P(loss >= threshold) via binary-ish count on sorted ascending.
        let count = 0;
        for (let j = sorted.length - 1; j >= 0 && sorted[j] >= threshold; j--) count++;
        lossExceedanceCurve.push({ threshold, probability: count / sorted.length });
    }

    const tailMean = tailSum / tail;
    const convergenceDelta = mean > 0 ? Math.abs(tailMean - mean) / mean : 0;

    return {
        portfolioAle: {
            mean, median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9),
            p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), stdDev,
            min: sorted[0], max: sorted[sorted.length - 1],
        },
        perRisk, lossExceedanceCurve, convergenceDelta, iterationsRun: iterations, executionMs: Date.now() - start,
    };
}

// ── DB-backed simulation ──────────────────────────────────────────────

/** Load the tenant's quantified risks as SimRisk[] (FAIR dists or point ALE). */
async function loadSimRisks(ctx: RequestContext): Promise<SimRisk[]> {
    const rows = await runInTenantContext(ctx, (db) =>
        db.risk.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, title: true, fairAle: true, sleAmount: true, aroAmount: true, fairInputsJson: true },
            take: 10000,
        }),
    );
    const out: SimRisk[] = [];
    for (const r of rows) {
        const point = resolveALE({ fairAle: r.fairAle, sleAmount: r.sleAmount, aroAmount: r.aroAmount });
        const dists = parseDistributions(r.fairInputsJson);
        if (point == null && !dists) continue; // not quantified
        out.push({ id: r.id, title: r.title, pointAle: point ?? 0, distributions: dists });
    }
    return out;
}

/** Parse fairInputsJson into FairDistributions if it carries all 5 factors. */
function parseDistributions(json: unknown): FairDistributions | undefined {
    if (!json || typeof json !== 'object') return undefined;
    const j = json as Record<string, PertDistribution | undefined>;
    const need = ['tef', 'vulnerability', 'plm', 'slef', 'slm'] as const;
    if (!need.every((k) => j[k] && typeof j[k]!.min === 'number')) return undefined;
    return { tef: j.tef!, vulnerability: j.vulnerability!, plm: j.plm!, slef: j.slef!, slm: j.slm! };
}

/** Run + persist a simulation. Returns the result + the run id. */
export async function runSimulation(
    ctx: RequestContext,
    config: SimulationConfig = {},
): Promise<SimulationResult & { runId: string }> {
    assertCanRead(ctx);
    const risks = await loadSimRisks(ctx);
    const result = simulatePortfolio(risks, config);
    const run = await runInTenantContext(ctx, (db) =>
        db.riskSimulationRun.create({
            data: {
                tenantId: ctx.tenantId,
                triggeredBy: 'manual',
                createdByUserId: ctx.userId,
                iterations: result.iterationsRun,
                seed: config.seed ?? null,
                portfolioMean: result.portfolioAle.mean,
                portfolioP50: result.portfolioAle.median,
                portfolioP90: result.portfolioAle.p90,
                portfolioP95: result.portfolioAle.p95,
                portfolioP99: result.portfolioAle.p99,
                portfolioStdDev: result.portfolioAle.stdDev,
                perRiskResultsJson: result.perRisk as unknown as Prisma.InputJsonValue,
                lecPointsJson: result.lossExceedanceCurve as unknown as Prisma.InputJsonValue,
                convergenceDelta: result.convergenceDelta,
                executionMs: result.executionMs,
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        }),
    );
    return { ...result, runId: run.id };
}

/** Most recent COMPLETED simulation for the dashboard. */
export async function getLatestSimulation(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.riskSimulationRun.findFirst({
            where: { tenantId: ctx.tenantId, status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
        }),
    );
}
