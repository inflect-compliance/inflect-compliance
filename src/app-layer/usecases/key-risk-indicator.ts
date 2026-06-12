/**
 * RQ-6 — Key Risk Indicators (KRI).
 *
 * Measurable leading/lagging indicators with RAG thresholds. Readings are
 * tracked over time (sparkline); a worsening threshold crossing raises a
 * breach (audit event + `breached` flag) so risk managers get early warning.
 *
 * `computeRag` is pure — unit-testable.
 *
 * @module usecases/key-risk-indicator
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';

export type Rag = 'GREEN' | 'AMBER' | 'RED';
export type KriDirection = 'HIGHER_IS_WORSE' | 'LOWER_IS_WORSE';

/**
 * RAG status for a value. Null thresholds disable that band; both null →
 * always GREEN. For HIGHER_IS_WORSE, value ≤ greenMax is green, ≤ amberMax
 * amber, else red. For LOWER_IS_WORSE the scale inverts (high = good).
 */
export function computeRag(value: number, direction: KriDirection, greenMax: number | null, amberMax: number | null): Rag {
    if (greenMax == null && amberMax == null) return 'GREEN';
    if (direction === 'HIGHER_IS_WORSE') {
        if (greenMax != null && value <= greenMax) return 'GREEN';
        if (amberMax != null && value <= amberMax) return 'AMBER';
        return 'RED';
    }
    // LOWER_IS_WORSE — higher values are better.
    if (amberMax != null && value >= amberMax) return 'GREEN';
    if (greenMax != null && value >= greenMax) return 'AMBER';
    return 'RED';
}

const RAG_RANK: Record<Rag, number> = { GREEN: 0, AMBER: 1, RED: 2 };
const isWorse = (prev: Rag | null, next: Rag) => prev != null && RAG_RANK[next] > RAG_RANK[prev];

// ── CRUD ──────────────────────────────────────────────────────────────

export interface CreateKriInput {
    name: string; riskId?: string | null; description?: string | null; unit?: string | null;
    direction?: KriDirection; greenMax?: number | null; amberMax?: number | null;
    frequency?: string; ownerUserId?: string | null; targetValue?: number | null; automationRuleId?: string | null;
}

export async function createKri(ctx: RequestContext, input: CreateKriInput) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, (db) =>
        db.keyRiskIndicator.create({
            data: {
                tenantId: ctx.tenantId, name: input.name, riskId: input.riskId ?? null, description: input.description ?? null,
                unit: input.unit ?? null, direction: input.direction ?? 'HIGHER_IS_WORSE', greenMax: input.greenMax ?? null,
                amberMax: input.amberMax ?? null, frequency: input.frequency ?? 'MONTHLY', ownerUserId: input.ownerUserId ?? null,
                targetValue: input.targetValue ?? null, automationRuleId: input.automationRuleId ?? null,
            },
        }),
    );
}

export interface UpdateKriInput { name?: string; description?: string | null; unit?: string | null; direction?: KriDirection; greenMax?: number | null; amberMax?: number | null; frequency?: string; ownerUserId?: string | null; targetValue?: number | null; isActive?: boolean }

export async function updateKri(ctx: RequestContext, kriId: string, patch: UpdateKriInput) {
    assertCanWrite(ctx);
    await runInTenantContext(ctx, (db) => db.keyRiskIndicator.updateMany({ where: { id: kriId, tenantId: ctx.tenantId }, data: patch }));
}

export async function deleteKri(ctx: RequestContext, kriId: string) {
    assertCanWrite(ctx);
    await runInTenantContext(ctx, (db) => db.keyRiskIndicator.deleteMany({ where: { id: kriId, tenantId: ctx.tenantId } }));
}

export async function listKris(ctx: RequestContext, opts: { riskId?: string; isActive?: boolean } = {}) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const kris = await db.keyRiskIndicator.findMany({
            where: { tenantId: ctx.tenantId, ...(opts.riskId ? { riskId: opts.riskId } : {}), ...(opts.isActive !== undefined ? { isActive: opts.isActive } : {}) },
            orderBy: { createdAt: 'desc' }, take: 500,
        });
        // Attach the latest reading + a small sparkline window per KRI.
        const ids = kris.map((k) => k.id);
        const readings = ids.length
            ? await db.kriReading.findMany({ where: { tenantId: ctx.tenantId, kriId: { in: ids } }, orderBy: { recordedAt: 'desc' }, take: 6000 })
            : [];
        const byKri = new Map<string, typeof readings>();
        for (const r of readings) { const arr = byKri.get(r.kriId) ?? []; arr.push(r); byKri.set(r.kriId, arr); }
        return kris.map((k) => {
            const rs = byKri.get(k.id) ?? [];
            return { ...k, latestReading: rs[0] ?? null, sparkline: rs.slice(0, 12).reverse().map((r) => r.value) };
        });
    });
}

// ── Readings ──────────────────────────────────────────────────────────

export async function recordReading(
    ctx: RequestContext,
    kriId: string,
    input: { value: number; note?: string; recordedBy?: string },
): Promise<{ reading: { id: string; value: number; ragStatus: string | null }; breached: boolean; rag: Rag }> {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const kri = await db.keyRiskIndicator.findFirst({ where: { id: kriId, tenantId: ctx.tenantId } });
        if (!kri) throw notFound('KRI not found');
        const rag = computeRag(input.value, kri.direction as KriDirection, kri.greenMax, kri.amberMax);
        const prev = await db.kriReading.findFirst({ where: { tenantId: ctx.tenantId, kriId }, orderBy: { recordedAt: 'desc' }, select: { ragStatus: true } });
        const breached = isWorse((prev?.ragStatus as Rag | null) ?? null, rag);
        const reading = await db.kriReading.create({
            data: { tenantId: ctx.tenantId, kriId, value: input.value, ragStatus: rag, recordedBy: input.recordedBy ?? ctx.userId, note: input.note ?? null },
        });
        if (breached) {
            await logEvent(db, ctx, {
                action: 'KRI_THRESHOLD_BREACH', entityType: 'KeyRiskIndicator', entityId: kriId,
                details: `KRI "${kri.name}" crossed into ${rag}`,
                detailsJson: { category: 'status_change', toStatus: rag, fromStatus: prev?.ragStatus ?? null, summary: `KRI ${kri.name} → ${rag}` },
            });
        }
        return { reading: { id: reading.id, value: reading.value, ragStatus: reading.ragStatus }, breached, rag };
    });
}

export async function batchRecordReadings(ctx: RequestContext, readings: Array<{ kriId: string; value: number; note?: string }>) {
    assertCanWrite(ctx);
    const out = [];
    for (const r of readings) out.push(await recordReading(ctx, r.kriId, { value: r.value, note: r.note, recordedBy: 'system' }));
    return out;
}

/**
 * RQ3-7 — the KRI-breach signal for ONE risk, for the assessment
 * tab's re-assess nudge. Returns the active KRIs linked to the risk
 * whose latest reading is RED (currently breached), newest breach
 * first. Empty array = no live signal → no nudge. Pure read; a
 * recovery (later non-RED reading) drops the KRI from the list with
 * no extra bookkeeping.
 */
export interface RiskKriBreach {
    kriId: string;
    name: string;
    ragStatus: 'RED';
    value: number;
    breachedAt: Date;
}

export async function getRiskKriBreaches(
    ctx: RequestContext,
    riskId: string,
): Promise<RiskKriBreach[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const kris = await db.keyRiskIndicator.findMany({
            where: { tenantId: ctx.tenantId, riskId, isActive: true },
            select: { id: true, name: true },
        });
        if (kris.length === 0) return [];
        const kriIds = kris.map((k) => k.id);
        const nameByKri = new Map(kris.map((k) => [k.id, k.name]));
        const newest = await db.kriReading.groupBy({
            by: ['kriId'],
            where: { tenantId: ctx.tenantId, kriId: { in: kriIds } },
            _max: { recordedAt: true },
        });
        const newestAtByKri = new Map<string, Date>();
        for (const n of newest) {
            if (n._max.recordedAt) newestAtByKri.set(n.kriId, n._max.recordedAt);
        }
        const latest = await db.kriReading.findMany({
            where: {
                tenantId: ctx.tenantId,
                kriId: { in: kriIds },
                recordedAt: { in: [...newestAtByKri.values()] },
            },
            select: { kriId: true, ragStatus: true, value: true, recordedAt: true },
        });
        const out: RiskKriBreach[] = [];
        for (const r of latest) {
            if (newestAtByKri.get(r.kriId)?.getTime() !== r.recordedAt.getTime()) continue;
            if (r.ragStatus !== 'RED') continue;
            out.push({
                kriId: r.kriId,
                name: nameByKri.get(r.kriId) ?? 'Key risk indicator',
                ragStatus: 'RED',
                value: r.value,
                breachedAt: r.recordedAt,
            });
        }
        return out.sort((a, b) => b.breachedAt.getTime() - a.breachedAt.getTime());
    });
}

export async function getReadings(ctx: RequestContext, kriId: string, opts: { since?: Date; limit?: number } = {}) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.kriReading.findMany({
            where: { tenantId: ctx.tenantId, kriId, ...(opts.since ? { recordedAt: { gte: opts.since } } : {}) },
            orderBy: { recordedAt: 'desc' }, take: Math.min(opts.limit ?? 100, 1000),
        }),
    );
}
