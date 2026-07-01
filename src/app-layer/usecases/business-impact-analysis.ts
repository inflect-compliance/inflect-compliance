/**
 * Business Impact Analysis (ISO 22301 / NIS2 Art.21(2)(c) / DORA) usecase.
 *
 * Clean-room from the recognised BIA methodology. The operational artifact
 * that satisfies the NIS2 business-continuity requirement IC previously
 * only seeded. Lives beside Incidents in the Internal Audit area as a
 * sibling operational-resilience obligation.
 *
 * Wiring (all DERIVED — no BIA surface is forced onto unrelated entities):
 *   - Process: a BIA attaches to a ProcessNode; the canvas cross-links.
 *   - Control: `getControlBiaSurface` returns exactly ONE of
 *       (a) 'continuity'  — control satisfies Art.21(2)(c)/22301 → the
 *                           BIAs linked to it as evidence,
 *       (b) 'process'     — control protects a process that HAS a BIA →
 *                           a derived impact chip,
 *       (c) 'none'        — render nothing (the no-dead-tab lock).
 *   - Incident: `getIncidentBiaContext` surfaces the RTO/MTPD of any BIA
 *     reachable from the incident's linked controls (recovery deadline).
 */
import { z } from 'zod';
import { RequestContext } from '../types';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest, notFound } from '@/lib/errors/types';
import { logEvent } from '../events/audit';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { deriveRecoveryPriority, rankFor } from '../services/bia-recovery-priority';

/**
 * Requirement codes whose control is a "continuity control" (case 4a).
 * NIS2 Art.21(2)(c) is the primary; ISO 22301 / ISO 27001 ICT-continuity
 * codes join it. Also matched heuristically by a title containing
 * "continuit" so tenant-renamed requirements still resolve.
 */
export const CONTINUITY_REQUIREMENT_CODES = ['Art.21(2)(c)', 'A.5.29', 'A.5.30'] as const;

const CriticalityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const DependencyTypeEnum = z.enum(['PROCESS', 'ASSET', 'VENDOR']);

const DependencyInput = z.object({
    dependsOnType: DependencyTypeEnum,
    dependsOnId: z.string().min(1),
});

export const CreateBiaSchema = z.object({
    name: z.string().min(1).max(300),
    criticality: CriticalityEnum,
    processNodeId: z.string().optional().nullable(),
    rtoHours: z.number().int().min(0).max(100_000).optional().nullable(),
    rpoHours: z.number().int().min(0).max(100_000).optional().nullable(),
    mtpdHours: z.number().int().min(0).max(100_000).optional().nullable(),
    impactProfile: z
        .array(
            z.object({
                atHours: z.number(),
                financial: z.number().optional(),
                operational: z.number().optional(),
                reputational: z.number().optional(),
                legal: z.number().optional(),
            }),
        )
        .optional()
        .nullable(),
    notes: z.string().max(20_000).optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    dependencies: z.array(DependencyInput).optional(),
});

export const UpdateBiaSchema = CreateBiaSchema.partial().extend({
    reviewedAt: z.string().datetime().optional().nullable(),
});

export type CreateBiaInput = z.input<typeof CreateBiaSchema>;

async function assertProcessNode(
    db: Parameters<Parameters<typeof runInTenantContext>[1]>[0],
    ctx: RequestContext,
    processNodeId: string | null | undefined,
) {
    if (!processNodeId) return;
    const node = await db.processNode.findFirst({
        where: { id: processNodeId, tenantId: ctx.tenantId },
        select: { id: true },
    });
    if (!node) throw badRequest('INVALID_PROCESS_NODE', 'Process node not found in this tenant');
}

export async function createBia(ctx: RequestContext, rawInput: CreateBiaInput) {
    assertCanWrite(ctx);
    const data = CreateBiaSchema.parse(rawInput);
    return runInTenantContext(ctx, async (db) => {
        await assertProcessNode(db, ctx, data.processNodeId);
        const bia = await db.businessImpactAnalysis.create({
            data: {
                tenantId: ctx.tenantId,
                name: sanitizePlainText(data.name),
                criticality: data.criticality,
                processNodeId: data.processNodeId ?? null,
                rtoHours: data.rtoHours ?? null,
                rpoHours: data.rpoHours ?? null,
                mtpdHours: data.mtpdHours ?? null,
                impactProfile: data.impactProfile ?? undefined,
                notes: data.notes ? sanitizePlainText(data.notes) : null,
                ownerUserId: data.ownerUserId ?? null,
            },
        });
        if (data.dependencies?.length) {
            await db.biaDependency.createMany({
                data: data.dependencies.map((d) => ({
                    tenantId: ctx.tenantId,
                    biaId: bia.id,
                    dependsOnType: d.dependsOnType,
                    dependsOnId: d.dependsOnId,
                })),
            });
        }
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'BusinessImpactAnalysis',
            entityId: bia.id,
            details: `Created BIA: ${bia.name}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'BusinessImpactAnalysis', operation: 'created' },
        });
        return bia;
    });
}

/** Register list — enriched with the recovery-priority rank across the set. */
export async function listBias(ctx: RequestContext, opts?: { criticality?: string; take?: number }) {
    assertCanRead(ctx);
    const rows = await runInTenantContext(ctx, async (db) => {
        return db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId, ...(opts?.criticality ? { criticality: opts.criticality } : {}) },
            include: {
                processNode: { select: { id: true, label: true } },
                ownerUser: { select: { id: true, name: true, email: true } },
                _count: { select: { dependencies: true } },
            },
            orderBy: [{ criticality: 'asc' }, { mtpdHours: 'asc' }],
            take: Math.min(opts?.take ?? 200, 500),
        });
    });
    const rankings = deriveRecoveryPriority(
        rows.map((r) => ({ id: r.id, criticality: r.criticality, mtpdHours: r.mtpdHours, rtoHours: r.rtoHours })),
    );
    return rows
        .map((r) => ({ ...r, recovery: rankFor(r.id, rankings) }))
        .sort((a, b) => (a.recovery?.rank ?? 999) - (b.recovery?.rank ?? 999));
}

/** Full detail — dependencies, process node, linked controls/risks, rank. */
export async function getBia(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const bia = await db.businessImpactAnalysis.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                processNode: { select: { id: true, label: true, processMapId: true } },
                ownerUser: { select: { id: true, name: true, email: true } },
                dependencies: true,
                evidenceLinks: { select: { id: true, controlId: true } },
            },
        });
        if (!bia) throw notFound('BIA not found');

        // Recovery rank is relative to the full tenant set.
        const all = await db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, criticality: true, mtpdHours: true, rtoHours: true },
            take: 500,
        });
        const recovery = rankFor(id, deriveRecoveryPriority(all));
        return { ...bia, recovery };
    });
}

export async function updateBia(ctx: RequestContext, id: string, rawInput: z.input<typeof UpdateBiaSchema>) {
    assertCanWrite(ctx);
    const data = UpdateBiaSchema.parse(rawInput);
    return runInTenantContext(ctx, async (db) => {
        const existing = await db.businessImpactAnalysis.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
        if (!existing) throw notFound('BIA not found');
        await assertProcessNode(db, ctx, data.processNodeId);
        const bia = await db.businessImpactAnalysis.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: sanitizePlainText(data.name) }),
                ...(data.criticality !== undefined && { criticality: data.criticality }),
                ...(data.processNodeId !== undefined && { processNodeId: data.processNodeId }),
                ...(data.rtoHours !== undefined && { rtoHours: data.rtoHours }),
                ...(data.rpoHours !== undefined && { rpoHours: data.rpoHours }),
                ...(data.mtpdHours !== undefined && { mtpdHours: data.mtpdHours }),
                ...(data.impactProfile !== undefined && { impactProfile: data.impactProfile ?? undefined }),
                ...(data.notes !== undefined && { notes: data.notes ? sanitizePlainText(data.notes) : null }),
                ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId }),
                ...(data.reviewedAt !== undefined && { reviewedAt: data.reviewedAt ? new Date(data.reviewedAt) : null }),
            },
        });
        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'BusinessImpactAnalysis',
            entityId: id,
            details: `Updated BIA: ${bia.name}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'BusinessImpactAnalysis', operation: 'updated' },
        });
        return bia;
    });
}

export async function deleteBia(ctx: RequestContext, id: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const existing = await db.businessImpactAnalysis.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, name: true } });
        if (!existing) throw notFound('BIA not found');
        await db.businessImpactAnalysis.delete({ where: { id } });
        await logEvent(db, ctx, {
            action: 'DELETE',
            entityType: 'BusinessImpactAnalysis',
            entityId: id,
            details: `Deleted BIA: ${existing.name}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'BusinessImpactAnalysis', operation: 'deleted' },
        });
        return { id };
    });
}

/** Attach a BIA to a control as evidence (kind BIA) — the continuity link. */
export async function linkBiaToControl(ctx: RequestContext, biaId: string, controlId: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const [bia, control] = await Promise.all([
            db.businessImpactAnalysis.findFirst({ where: { id: biaId, tenantId: ctx.tenantId }, select: { id: true, name: true } }),
            db.control.findFirst({ where: { id: controlId, tenantId: ctx.tenantId }, select: { id: true } }),
        ]);
        if (!bia) throw notFound('BIA not found');
        if (!control) throw badRequest('INVALID_CONTROL', 'Control not found in this tenant');
        const link = await db.controlEvidenceLink.upsert({
            where: { controlId_kind_biaId: { controlId, kind: 'BIA', biaId } },
            create: { tenantId: ctx.tenantId, controlId, kind: 'BIA', biaId, note: `BIA: ${bia.name}`, createdByUserId: ctx.userId },
            update: {},
        });
        return link;
    });
}

export type ControlBiaSurface =
    | { kind: 'none' }
    | { kind: 'continuity'; bias: { id: string; name: string; criticality: string; mtpdHours: number | null }[] }
    | { kind: 'process'; processLabel: string; biaId: string; name: string; mtpdHours: number | null; recoveryRank: number };

/**
 * The conditional control-wiring resolver (cases 4a/4b/4c). A control gets
 * a BIA surface ONLY via (a) being a continuity control with linked BIAs,
 * or (b) protecting a process that has a BIA. Otherwise 'none'. This is the
 * single source of truth the no-dead-tab guard verifies against.
 */
export async function getControlBiaSurface(ctx: RequestContext, controlId: string): Promise<ControlBiaSurface> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        // (a) Continuity control — linked to an Art.21(2)(c)/22301 requirement.
        const reqLinks = await db.controlRequirementLink.findMany({
            where: {
                tenantId: ctx.tenantId,
                controlId,
                requirement: {
                    OR: [
                        { code: { in: [...CONTINUITY_REQUIREMENT_CODES] } },
                        { title: { contains: 'continuit', mode: 'insensitive' } },
                    ],
                },
            },
            select: { id: true },
            take: 1,
        });
        if (reqLinks.length > 0) {
            const links = await db.controlEvidenceLink.findMany({
                where: { tenantId: ctx.tenantId, controlId, kind: 'BIA', biaId: { not: null } },
                select: { bia: { select: { id: true, name: true, criticality: true, mtpdHours: true } } },
                take: 50,
            });
            const bias = links.map((l) => l.bia).filter((b): b is NonNullable<typeof b> => b != null);
            return { kind: 'continuity', bias };
        }

        // (b) Process-protecting control — control → edge → node → BIA.
        const edgeControls = await db.processEdgeControl.findMany({
            where: { tenantId: ctx.tenantId, controlId },
            select: { edgeId: true },
            take: 200,
        });
        if (edgeControls.length === 0) return { kind: 'none' };
        const edges = await db.processEdge.findMany({
            where: { tenantId: ctx.tenantId, id: { in: edgeControls.map((e) => e.edgeId) } },
            select: { processMapId: true, sourceKey: true, targetKey: true },
            take: 400,
        });
        const nodeKeys = [...new Set(edges.flatMap((e) => [e.sourceKey, e.targetKey]))];
        const mapIds = [...new Set(edges.map((e) => e.processMapId))];
        if (nodeKeys.length === 0) return { kind: 'none' };
        const nodes = await db.processNode.findMany({
            where: { tenantId: ctx.tenantId, processMapId: { in: mapIds }, nodeKey: { in: nodeKeys } },
            select: { id: true, label: true },
            take: 400,
        });
        if (nodes.length === 0) return { kind: 'none' };
        const nodeById = new Map(nodes.map((n) => [n.id, n.label] as const));
        const bias = await db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId, processNodeId: { in: nodes.map((n) => n.id) } },
            select: { id: true, name: true, criticality: true, mtpdHours: true, rtoHours: true, processNodeId: true },
            take: 100,
        });
        if (bias.length === 0) return { kind: 'none' };
        // Chip shows the single highest-recovery-priority protected process.
        const all = await db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, criticality: true, mtpdHours: true, rtoHours: true },
            take: 500,
        });
        const rankings = deriveRecoveryPriority(all);
        const top = bias
            .map((b) => ({ b, rank: rankFor(b.id, rankings)?.rank ?? 999 }))
            .sort((x, y) => x.rank - y.rank)[0];
        return {
            kind: 'process',
            processLabel: (top.b.processNodeId && nodeById.get(top.b.processNodeId)) || top.b.name,
            biaId: top.b.id,
            name: top.b.name,
            mtpdHours: top.b.mtpdHours,
            recoveryRank: top.rank,
        };
    });
}

/** BIAs attached to a process node — the canvas cross-link. */
export async function getBiasForProcessNode(ctx: RequestContext, processNodeId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        return db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId, processNodeId },
            select: { id: true, name: true, criticality: true, mtpdHours: true, rtoHours: true },
            take: 50,
        });
    });
}

/**
 * Canvas cross-link resolver: the process canvas works in client-stable
 * `nodeKey`s, but a BIA attaches to the DB ProcessNode.id. Resolve
 * (processMapId, nodeKey) → id, then return the node's BIAs plus the
 * resolved id (so the "Add BIA" affordance can prefill the create form).
 */
export async function getBiasForProcessNodeKey(ctx: RequestContext, processMapId: string, nodeKey: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const node = await db.processNode.findFirst({
            where: { tenantId: ctx.tenantId, processMapId, nodeKey },
            select: { id: true },
        });
        if (!node) return { processNodeId: null, rows: [] };
        const rows = await db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId, processNodeId: node.id },
            select: { id: true, name: true, criticality: true, mtpdHours: true, rtoHours: true },
            take: 50,
        });
        return { processNodeId: node.id, rows };
    });
}

/**
 * Recovery-deadline context for a live incident: the BIAs reachable from
 * the incident's linked controls (control → process → BIA). Derived — no
 * direct incident→process FK exists, so we resolve via the controls the
 * incident already references. Returns the tightest-MTPD BIAs first.
 */
export async function getIncidentBiaContext(ctx: RequestContext, incidentId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const incident = await db.incident.findFirst({
            where: { id: incidentId, tenantId: ctx.tenantId },
            select: { linkedControlIds: true },
        });
        if (!incident || incident.linkedControlIds.length === 0) return [];

        // control → edge → node → BIA, all batched (no N+1).
        const edgeControls = await db.processEdgeControl.findMany({
            where: { tenantId: ctx.tenantId, controlId: { in: incident.linkedControlIds } },
            select: { edgeId: true },
            take: 500,
        });
        if (edgeControls.length === 0) return [];
        const edges = await db.processEdge.findMany({
            where: { tenantId: ctx.tenantId, id: { in: edgeControls.map((e) => e.edgeId) } },
            select: { processMapId: true, sourceKey: true, targetKey: true },
            take: 500,
        });
        const nodeKeys = [...new Set(edges.flatMap((e) => [e.sourceKey, e.targetKey]))];
        const mapIds = [...new Set(edges.map((e) => e.processMapId))];
        if (nodeKeys.length === 0) return [];
        const nodes = await db.processNode.findMany({
            where: { tenantId: ctx.tenantId, processMapId: { in: mapIds }, nodeKey: { in: nodeKeys } },
            select: { id: true },
            take: 500,
        });
        if (nodes.length === 0) return [];
        const bias = await db.businessImpactAnalysis.findMany({
            where: { tenantId: ctx.tenantId, processNodeId: { in: nodes.map((n) => n.id) } },
            select: { id: true, name: true, criticality: true, mtpdHours: true, rtoHours: true },
            orderBy: { mtpdHours: 'asc' },
            take: 20,
        });
        return bias;
    });
}
