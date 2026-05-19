/**
 * Roadmap-26 PR-A — ProcessMap repository.
 *
 * Persists the Process-Map graph (nodes + edges + edge-controls)
 * with a full-graph replace semantic. The usecase layer above
 * calls `replaceGraph(...)` on every save; this repo deletes the
 * existing graph children inside a transaction and recreates them
 * with the supplied payload, then bumps the parent map's
 * `version` + `updatedAt`.
 *
 * Why a transaction for the whole replace:
 *   The graph is conceptually one document. A partial replace
 *   would leave the canvas in a structurally broken state (e.g.
 *   edges referencing nodes that no longer exist). Wrapping
 *   delete+create in `db.$transaction` makes either all of it
 *   land or none of it.
 *
 * Why we don't diff before replacing:
 *   Per-row diff (node moved by 4px → UPDATE; new node added →
 *   INSERT; removed node → DELETE) is more efficient but adds
 *   complexity for negligible benefit at the bounded graph sizes
 *   the Processes page targets (dozens of nodes). The full
 *   replace keeps the repo's contract trivially auditable.
 */

import { PrismaTx } from '@/lib/db-context';
import { Prisma } from '@prisma/client';
import { RequestContext } from '../types';
import type {
    ProcessNodeInput,
    ProcessEdgeInput,
    ProcessMapStatusValue,
} from '../schemas/process-map';

export interface ProcessMapListItem {
    id: string;
    name: string;
    description: string | null;
    status: ProcessMapStatusValue;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    nodeCount: number;
    edgeCount: number;
}

export interface ProcessMapWithGraph {
    id: string;
    name: string;
    description: string | null;
    status: ProcessMapStatusValue;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    nodes: Array<{
        nodeKey: string;
        nodeType: string;
        label: string;
        subtitle: string | null;
        posX: number;
        posY: number;
        dataJson: unknown;
    }>;
    edges: Array<{
        edgeKey: string;
        sourceKey: string;
        targetKey: string;
        edgeKind: string;
        labelOverride: string | null;
        dataJson: unknown;
        controls: Array<{
            controlKey: string;
            label: string;
            controlId: string | null;
            dataJson: unknown;
        }>;
    }>;
}

export class ProcessMapRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
    ): Promise<ProcessMapListItem[]> {
        const rows = await db.processMap.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            orderBy: [{ updatedAt: 'desc' }],
            select: {
                id: true,
                name: true,
                description: true,
                status: true,
                version: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { nodes: true, edges: true } },
            },
        });
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status,
            version: r.version,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            nodeCount: r._count.nodes,
            edgeCount: r._count.edges,
        }));
    }

    static async getByIdWithGraph(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
    ): Promise<ProcessMapWithGraph | null> {
        const map = await db.processMap.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            include: {
                nodes: {
                    orderBy: { nodeKey: 'asc' },
                    select: {
                        nodeKey: true,
                        nodeType: true,
                        label: true,
                        subtitle: true,
                        posX: true,
                        posY: true,
                        dataJson: true,
                    },
                },
                edges: {
                    orderBy: { edgeKey: 'asc' },
                    select: {
                        edgeKey: true,
                        sourceKey: true,
                        targetKey: true,
                        edgeKind: true,
                        labelOverride: true,
                        dataJson: true,
                        controls: {
                            orderBy: { controlKey: 'asc' },
                            select: {
                                controlKey: true,
                                label: true,
                                controlId: true,
                                dataJson: true,
                            },
                        },
                    },
                },
            },
        });
        if (!map) return null;
        return {
            id: map.id,
            name: map.name,
            description: map.description,
            status: map.status,
            version: map.version,
            createdAt: map.createdAt,
            updatedAt: map.updatedAt,
            nodes: map.nodes,
            edges: map.edges,
        };
    }

    static async create(
        db: PrismaTx,
        ctx: RequestContext,
        input: {
            name: string;
            description?: string | null;
            status?: ProcessMapStatusValue;
            createdByUserId: string;
        },
    ): Promise<ProcessMapWithGraph> {
        const created = await db.processMap.create({
            data: {
                tenantId: ctx.tenantId,
                name: input.name,
                description: input.description ?? null,
                status: input.status ?? 'DRAFT',
                createdByUserId: input.createdByUserId,
            },
        });
        return {
            id: created.id,
            name: created.name,
            description: created.description,
            status: created.status,
            version: created.version,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            nodes: [],
            edges: [],
        };
    }

    /**
     * Replace the graph atomically.
     *
     * Steps:
     *   1. Verify the map exists + belongs to the tenant.
     *   2. Validate that every edge's source/target key references
     *      a node key in the supplied node set (cheap structural
     *      guard; the DB has no FK to enforce this since nodeKey
     *      is per-map, not globally unique).
     *   3. Transactionally:
     *      a. Delete all existing nodes + edges for the map.
     *         Cascading FK takes care of edge-controls.
     *      b. Insert the new node set.
     *      c. Insert the new edge set.
     *      d. Insert each edge's controls.
     *      e. Bump version + apply metadata edits.
     */
    static async replaceGraph(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        input: {
            name?: string;
            description?: string | null;
            status?: ProcessMapStatusValue;
            nodes: ProcessNodeInput[];
            edges: ProcessEdgeInput[];
        },
    ): Promise<ProcessMapWithGraph | null> {
        // Structural validation — fail fast before opening a tx.
        const nodeKeys = new Set(input.nodes.map((n) => n.nodeKey));
        for (const e of input.edges) {
            if (!nodeKeys.has(e.sourceKey)) {
                throw new Error(
                    `Edge ${e.edgeKey} references unknown source nodeKey ${e.sourceKey}`,
                );
            }
            if (!nodeKeys.has(e.targetKey)) {
                throw new Error(
                    `Edge ${e.edgeKey} references unknown target nodeKey ${e.targetKey}`,
                );
            }
        }

        const existing = await db.processMap.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true },
        });
        if (!existing) return null;

        // The repo is invoked from the usecase via `runInTenantContext`
        // which already opens a Prisma `$transaction` and binds the
        // tenant-scoping session variable. We MUST NOT open a nested
        // transaction here — `PrismaTx` is the inner-tx type and
        // intentionally omits `$transaction` to enforce that
        // invariant. The sequential operations below are atomic for
        // free because they share the outer tx.

        // Cascading FK on ProcessNode / ProcessEdge → ProcessMap
        // would let us drop+recreate the parent, but that would
        // lose `createdAt` / `createdByUserId`. Cleaner to keep
        // the parent intact and delete just the children.
        await db.processEdge.deleteMany({
            where: { processMapId: id, tenantId: ctx.tenantId },
        });
        await db.processNode.deleteMany({
            where: { processMapId: id, tenantId: ctx.tenantId },
        });

        if (input.nodes.length > 0) {
            await db.processNode.createMany({
                data: input.nodes.map((n) => ({
                    tenantId: ctx.tenantId,
                    processMapId: id,
                    nodeKey: n.nodeKey,
                    nodeType: n.nodeType,
                    label: n.label,
                    subtitle: n.subtitle ?? null,
                    posX: n.posX,
                    posY: n.posY,
                    dataJson:
                        n.dataJson === undefined
                            ? Prisma.JsonNull
                            : (n.dataJson as Prisma.InputJsonValue | null) ??
                              Prisma.JsonNull,
                })),
            });
        }

        // Edges and their controls. Need each edge's row id back
        // to wire its controls, so we create one edge at a time
        // (createMany doesn't return ids in Postgres). At the
        // bounded graph sizes the Processes page targets the
        // per-edge round trip is fine.
        for (const e of input.edges) {
            const edge = await db.processEdge.create({
                data: {
                    tenantId: ctx.tenantId,
                    processMapId: id,
                    edgeKey: e.edgeKey,
                    sourceKey: e.sourceKey,
                    targetKey: e.targetKey,
                    edgeKind: e.edgeKind,
                    labelOverride: e.labelOverride ?? null,
                    dataJson:
                        e.dataJson === undefined
                            ? Prisma.JsonNull
                            : (e.dataJson as Prisma.InputJsonValue | null) ??
                              Prisma.JsonNull,
                },
            });
            if (e.controls.length > 0) {
                await db.processEdgeControl.createMany({
                    data: e.controls.map((c) => ({
                        tenantId: ctx.tenantId,
                        processMapId: id,
                        edgeId: edge.id,
                        controlKey: c.controlKey,
                        label: c.label,
                        controlId: c.controlId ?? null,
                        dataJson:
                            c.dataJson === undefined
                                ? Prisma.JsonNull
                                : (c.dataJson as
                                      | Prisma.InputJsonValue
                                      | null) ?? Prisma.JsonNull,
                    })),
                });
            }
        }

        await db.processMap.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined
                    ? { description: input.description }
                    : {}),
                ...(input.status !== undefined
                    ? { status: input.status }
                    : {}),
                version: { increment: 1 },
            },
        });

        return ProcessMapRepository.getByIdWithGraph(db, ctx, id);
    }

    static async softDelete(
        db: PrismaTx,
        ctx: RequestContext,
        id: string,
        userId: string,
    ): Promise<boolean> {
        const res = await db.processMap.updateMany({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            data: { deletedAt: new Date(), deletedByUserId: userId },
        });
        return res.count > 0;
    }
}
