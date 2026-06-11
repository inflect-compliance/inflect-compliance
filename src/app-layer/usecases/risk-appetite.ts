/**
 * RQ-2 — Risk appetite & tolerance framework.
 *
 * Tenant admins define quantitative appetite (portfolio ALE ceiling,
 * per-risk ALE/score caps, per-category overrides); the system detects
 * breaches (monitor job + write-path checks) and records/resolves them.
 *
 * The breach-detection MATH is a pure function (`detectBreaches`) so it
 * unit-tests without a DB; the DB wrappers load config + risks and call it.
 *
 * @module usecases/risk-appetite
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { Prisma } from '@prisma/client';
import { assertCanRead, assertCanAdmin, assertCanWrite } from '../policies/common';
import { notFound, badRequest } from '@/lib/errors/types';
import { logEvent } from '../events/audit';
import { resolveALE } from './fair-calculator';
import { formatCompactCurrency } from '@/lib/risk-coherence';
import { createTask, addTaskLink } from './task';

export type BreachType = 'PORTFOLIO_ALE' | 'SINGLE_RISK_ALE' | 'QUAL_SCORE' | 'CATEGORY_ALE';

export interface Breach {
    type: BreachType;
    riskId?: string;
    category?: string;
    threshold: number;
    actual: number;
}

export interface BreachCheckResult {
    breaches: Breach[];
    portfolioAle: number;
    isWithinAppetite: boolean;
}

interface CategoryOverride { totalAleMax?: number; singleAleMax?: number; qualScoreMax?: number }
type CategoryOverrides = Record<string, CategoryOverride>;

interface AppetiteThresholds {
    totalAleThreshold: number | null;
    singleRiskAleMax: number | null;
    qualScoreMax: number | null;
    categoryOverridesJson: unknown;
}

/** A risk reduced to the fields appetite cares about. */
export interface AppetiteRisk {
    id: string;
    score: number;
    category: string | null;
    ale: number; // resolved ALE (FAIR → legacy → 0)
}

// ── Pure breach detection ─────────────────────────────────────────────

/**
 * Detect every appetite breach for a portfolio. Pure — no DB. A null
 * threshold means that check is skipped. Per-category overrides take
 * precedence over the global thresholds.
 */
export function detectBreaches(config: AppetiteThresholds, risks: AppetiteRisk[]): BreachCheckResult {
    const overrides = (config.categoryOverridesJson ?? {}) as CategoryOverrides;
    const breaches: Breach[] = [];
    const portfolioAle = risks.reduce((s, r) => s + r.ale, 0);

    if (config.totalAleThreshold != null && portfolioAle > config.totalAleThreshold) {
        breaches.push({ type: 'PORTFOLIO_ALE', threshold: config.totalAleThreshold, actual: portfolioAle });
    }

    for (const r of risks) {
        const ov = r.category ? overrides[r.category] : undefined;
        const singleMax = ov?.singleAleMax ?? config.singleRiskAleMax;
        if (singleMax != null && r.ale > singleMax) {
            breaches.push({ type: 'SINGLE_RISK_ALE', riskId: r.id, threshold: singleMax, actual: r.ale });
        }
        const scoreMax = ov?.qualScoreMax ?? config.qualScoreMax;
        if (scoreMax != null && r.score > scoreMax) {
            breaches.push({ type: 'QUAL_SCORE', riskId: r.id, threshold: scoreMax, actual: r.score });
        }
    }

    // Per-category ALE ceilings.
    const byCat = new Map<string, number>();
    for (const r of risks) {
        if (!r.category) continue;
        byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.ale);
    }
    for (const [cat, total] of byCat) {
        const catMax = overrides[cat]?.totalAleMax;
        if (catMax != null && total > catMax) {
            breaches.push({ type: 'CATEGORY_ALE', category: cat, threshold: catMax, actual: total });
        }
    }

    return { breaches, portfolioAle, isWithinAppetite: breaches.length === 0 };
}

// ── CRUD ──────────────────────────────────────────────────────────────

export async function getAppetiteConfig(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.riskAppetiteConfig.findFirst({ where: { tenantId: ctx.tenantId } }),
    );
}

export interface UpsertAppetiteInput {
    totalAleThreshold?: number | null;
    singleRiskAleMax?: number | null;
    qualScoreMax?: number | null;
    categoryOverridesJson?: Record<string, CategoryOverride> | null;
    appetiteStatement?: string | null;
    approvedByUserId?: string | null;
    approvedAt?: string | null;
    reviewCadence?: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
    nextReviewAt?: string | null;
}

export async function upsertAppetiteConfig(ctx: RequestContext, input: UpsertAppetiteInput) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const data = {
            totalAleThreshold: input.totalAleThreshold ?? null,
            singleRiskAleMax: input.singleRiskAleMax ?? null,
            qualScoreMax: input.qualScoreMax ?? null,
            categoryOverridesJson: (input.categoryOverridesJson ?? undefined) as Prisma.InputJsonValue | undefined,
            appetiteStatement: input.appetiteStatement ?? null,
            approvedByUserId: input.approvedByUserId ?? null,
            approvedAt: input.approvedAt ? new Date(input.approvedAt) : null,
            reviewCadence: input.reviewCadence,
            nextReviewAt: input.nextReviewAt ? new Date(input.nextReviewAt) : null,
        };
        const existing = await db.riskAppetiteConfig.findFirst({ where: { tenantId: ctx.tenantId }, select: { id: true } });
        const saved = existing
            ? await db.riskAppetiteConfig.update({ where: { id: existing.id }, data })
            : await db.riskAppetiteConfig.create({ data: { tenantId: ctx.tenantId, ...data } });
        await logEvent(db, ctx, {
            action: 'RISK_APPETITE_CONFIGURED',
            entityType: 'RiskAppetiteConfig',
            entityId: saved.id,
            details: 'Updated risk appetite configuration',
            detailsJson: { category: 'custom', event: 'risk_appetite_configured', summary: 'Risk appetite updated' },
        });
        return saved;
    });
}

// ── Checks ────────────────────────────────────────────────────────────

async function loadAppetiteRisks(ctx: RequestContext): Promise<AppetiteRisk[]> {
    const rows = await runInTenantContext(ctx, (db) =>
        db.risk.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, score: true, category: true, fairAle: true, sleAmount: true, aroAmount: true },
            take: 10000,
        }),
    );
    return rows.map((r) => ({
        id: r.id,
        score: r.score,
        category: r.category,
        ale: resolveALE({ fairAle: r.fairAle, sleAmount: r.sleAmount, aroAmount: r.aroAmount }) ?? 0,
    }));
}

export async function checkPortfolioAppetite(ctx: RequestContext): Promise<BreachCheckResult> {
    assertCanRead(ctx);
    const config = await getAppetiteConfig(ctx);
    if (!config) return { breaches: [], portfolioAle: 0, isWithinAppetite: true };
    const risks = await loadAppetiteRisks(ctx);
    return detectBreaches(config, risks);
}

export async function checkSingleRiskAppetite(
    ctx: RequestContext,
    riskId: string,
): Promise<{ breached: boolean; details?: Breach }> {
    const config = await getAppetiteConfig(ctx);
    if (!config) return { breached: false };
    const risks = await loadAppetiteRisks(ctx);
    const target = risks.find((r) => r.id === riskId);
    if (!target) return { breached: false };
    // Only the single-risk + qual-score checks for this risk.
    const result = detectBreaches(config, [target]);
    const details = result.breaches.find((b) => b.riskId === riskId && b.type !== 'CATEGORY_ALE');
    return { breached: !!details, details };
}

// ── Breach persistence ────────────────────────────────────────────────

/** Persist new breaches idempotently (same type + riskId + unresolved). */
export async function recordBreaches(ctx: RequestContext, breaches: Breach[]): Promise<number> {
    if (breaches.length === 0) return 0;
    return runInTenantContext(ctx, async (db) => {
        // Load all unresolved breaches once (avoids a per-breach findFirst N+1),
        // then create/update from an in-memory map.
        const open = await db.riskAppetiteBreach.findMany({
            where: { tenantId: ctx.tenantId, resolvedAt: null },
            select: { id: true, breachType: true, riskId: true, category: true },
        });
        const key = (t: string, r: string | null, c: string | null) => `${t}:${r ?? ''}:${c ?? ''}`;
        const openByKey = new Map(open.map((o) => [key(o.breachType, o.riskId, o.category), o.id]));
        let created = 0;
        for (const b of breaches) {
            const existingId = openByKey.get(key(b.type, b.riskId ?? null, b.category ?? null));
            if (existingId) {
                await db.riskAppetiteBreach.update({ where: { id: existingId }, data: { actualValue: b.actual, thresholdValue: b.threshold } });
            } else {
                await db.riskAppetiteBreach.create({
                    data: {
                        tenantId: ctx.tenantId,
                        breachType: b.type,
                        riskId: b.riskId ?? null,
                        category: b.category ?? null,
                        thresholdValue: b.threshold,
                        actualValue: b.actual,
                    },
                });
                created++;
            }
        }
        return created;
    });
}

/** Resolve unresolved breaches that are no longer present in `active`. */
export async function resolveStaleBreaches(ctx: RequestContext, active: Breach[]): Promise<number> {
    return runInTenantContext(ctx, async (db) => {
        const open = await db.riskAppetiteBreach.findMany({
            where: { tenantId: ctx.tenantId, resolvedAt: null },
            select: { id: true, breachType: true, riskId: true, category: true },
        });
        const key = (b: { breachType: string; riskId: string | null; category: string | null }) =>
            `${b.breachType}:${b.riskId ?? ''}:${b.category ?? ''}`;
        const activeKeys = new Set(active.map((b) => `${b.type}:${b.riskId ?? ''}:${b.category ?? ''}`));
        let resolved = 0;
        for (const o of open) {
            if (!activeKeys.has(key(o))) {
                await db.riskAppetiteBreach.update({ where: { id: o.id }, data: { resolvedAt: new Date() } });
                resolved++;
            }
        }
        return resolved;
    });
}

export async function listBreaches(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.riskAppetiteBreach.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { detectedAt: 'desc' },
            take: 200,
        }),
    );
}

export async function acknowledgeBreach(ctx: RequestContext, breachId: string, note?: string) {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, (db) =>
        db.riskAppetiteBreach.updateMany({
            where: { id: breachId, tenantId: ctx.tenantId },
            data: { acknowledgedAt: new Date(), acknowledgedBy: ctx.userId, acknowledgementNote: note ?? null },
        }),
    );
}

// ── Breach → remediation task (RQ2-6) ────────────────────────────────

const BREACH_TASK_TITLE: Record<BreachType, (b: { thresholdValue: number; actualValue: number; category: string | null }) => string> = {
    PORTFOLIO_ALE: (b) =>
        `Bring portfolio ALE back within appetite (${formatCompactCurrency(b.actualValue)} over the ${formatCompactCurrency(b.thresholdValue)} ceiling)`,
    SINGLE_RISK_ALE: (b) =>
        `Remediate appetite breach: risk ALE ${formatCompactCurrency(b.actualValue)} exceeds the ${formatCompactCurrency(b.thresholdValue)} per-risk cap`,
    QUAL_SCORE: (b) =>
        `Remediate appetite breach: risk score ${Math.round(b.actualValue)} exceeds the ${Math.round(b.thresholdValue)} cap`,
    CATEGORY_ALE: (b) =>
        `Bring ${b.category ?? 'category'} ALE back within appetite (${formatCompactCurrency(b.actualValue)} over the ${formatCompactCurrency(b.thresholdValue)} ceiling)`,
};

/**
 * Spawn a remediation task from an open appetite breach.
 *
 * Idempotent: each breach claims at most ONE task — the claim is a
 * conditional update (`remediationTaskId: null` → task id), so a
 * double-click or a concurrent admin gets the existing task back
 * instead of a duplicate. The task is linked to the breached risk
 * (TaskLink RISK) when the breach is risk-attributed; portfolio /
 * category breaches produce an unlinked task. Composes the existing
 * `createTask` / `addTaskLink` usecases — no parallel task-creation
 * path.
 */
export async function createBreachRemediationTask(
    ctx: RequestContext,
    breachId: string,
): Promise<{ taskId: string; created: boolean }> {
    assertCanWrite(ctx);

    const breach = await runInTenantContext(ctx, (db) =>
        db.riskAppetiteBreach.findFirst({
            where: { id: breachId, tenantId: ctx.tenantId },
        }),
    );
    if (!breach) throw notFound('Breach not found');
    if (breach.resolvedAt) {
        throw badRequest('Breach is already resolved — nothing to remediate');
    }
    if (breach.remediationTaskId) {
        return { taskId: breach.remediationTaskId, created: false };
    }

    const title = BREACH_TASK_TITLE[breach.breachType as BreachType]?.(breach)
        ?? `Remediate risk-appetite breach (${breach.breachType})`;
    const task = await createTask(ctx, {
        title,
        type: 'TASK',
        priority: 'HIGH',
        source: 'risk_appetite_breach',
        description:
            `Spawned from appetite breach ${breach.id} (${breach.breachType}, ` +
            `detected ${breach.detectedAt.toISOString().slice(0, 10)}). ` +
            `Threshold ${breach.thresholdValue}, actual ${breach.actualValue}.`,
    });
    if (breach.riskId) {
        await addTaskLink(ctx, task.id, 'RISK', breach.riskId);
    }

    // Atomic claim — loser of a race gets the winner's task id.
    const claimed = await runInTenantContext(ctx, (db) =>
        db.riskAppetiteBreach.updateMany({
            where: { id: breachId, tenantId: ctx.tenantId, remediationTaskId: null },
            data: { remediationTaskId: task.id },
        }),
    );
    if (claimed.count === 0) {
        const winner = await runInTenantContext(ctx, (db) =>
            db.riskAppetiteBreach.findFirst({
                where: { id: breachId, tenantId: ctx.tenantId },
                select: { remediationTaskId: true },
            }),
        );
        return { taskId: winner?.remediationTaskId ?? task.id, created: false };
    }

    await runInTenantContext(ctx, (db) =>
        logEvent(db, ctx, {
            action: 'BREACH_REMEDIATION_TASK_CREATED',
            entityType: 'RiskAppetiteBreach',
            entityId: breachId,
            details: `Remediation task created for ${breach.breachType} breach`,
            detailsJson: {
                category: 'custom',
                event: 'breach_remediation_task_created',
                taskId: task.id,
                breachType: breach.breachType,
            },
        }),
    );

    return { taskId: task.id, created: true };
}

/** Dashboard badge status: within / approaching (>80% of ceiling) / breached. */
export async function getAppetiteStatus(
    ctx: RequestContext,
): Promise<{ status: 'NONE' | 'WITHIN' | 'APPROACHING' | 'BREACHED'; portfolioAle: number; activeBreaches: number }> {
    assertCanRead(ctx);
    const config = await getAppetiteConfig(ctx);
    if (!config) return { status: 'NONE', portfolioAle: 0, activeBreaches: 0 };
    const result = await checkPortfolioAppetite(ctx);
    if (result.breaches.length > 0) {
        return { status: 'BREACHED', portfolioAle: result.portfolioAle, activeBreaches: result.breaches.length };
    }
    if (config.totalAleThreshold != null && result.portfolioAle > config.totalAleThreshold * 0.8) {
        return { status: 'APPROACHING', portfolioAle: result.portfolioAle, activeBreaches: 0 };
    }
    return { status: 'WITHIN', portfolioAle: result.portfolioAle, activeBreaches: 0 };
}
