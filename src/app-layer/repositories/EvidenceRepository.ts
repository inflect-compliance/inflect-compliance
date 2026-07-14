import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma } from '@prisma/client';
import { buildCursorWhere, CURSOR_ORDER_BY, computePageInfo, clampLimit } from '@/lib/pagination';
import type { PaginatedResponse } from '@/lib/dto/pagination';
import { traceRepository } from '@/lib/observability/repository-tracing';

export interface EvidenceListFilters {
    type?: string;
    /** EvidenceStatus: DRAFT | SUBMITTED | APPROVED | REJECTED */
    status?: string;
    controlId?: string;
    /**
     * B8 follow-up — folder filter. `__none__` is the sentinel for
     * "evidence with NULL or empty folder"; any other value is an
     * exact-match. Omitted ⇒ no filter.
     */
    folder?: string;
    q?: string;
    archived?: boolean;
    expiring?: boolean;
}

export interface EvidenceListParams {
    limit?: number;
    cursor?: string;
    filters?: EvidenceListFilters;
}

// PR-3 — tight SELECT shape for the Evidence list page. Lists exactly
// the columns EvidenceClient.tsx renders. The previous `include`
// returned every Evidence scalar (encrypted-at-rest `data` blob,
// `summary`, `transcript`, etc.) — none rendered in list view.
const evidenceListSelect = {
    id: true,
    title: true,
    fileName: true,
    type: true,
    status: true,
    owner: true,
    // Real owner FK — seeds the edit modal's owner picker when the
    // Evidence list-row edit affordance opens it (B8 follow-up parity
    // with the detail sheet's edit).
    ownerUserId: true,
    // B8 follow-up — folder label is rendered as a column + drives
    // the Folder filter's option set.
    folder: true,
    isArchived: true,
    expiredAt: true,
    deletedAt: true,
    retentionUntil: true,
    // EP-2 — review-currency drives the freshness badge + the
    // freshness filter/KPIs. `nextReviewDate` (primary anchor) +
    // `reviewCycle` (cadence) surface the review schedule.
    nextReviewDate: true,
    reviewCycle: true,
    updatedAt: true,
    dateCollected: true,
    fileRecordId: true,
    // `createdAt` is required by the cursor-pagination helper
    // (`computePageInfo`) — it's not rendered in the table.
    createdAt: true,
    control: { select: { id: true, name: true, annexId: true } },
    fileRecord: { select: { id: true, mimeType: true } },
} as const;

export class EvidenceRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        filters?: EvidenceListFilters,
        options: { take?: number } = {},
    ) {
        return traceRepository('evidence.list', ctx, async () => {
            const where = EvidenceRepository._buildWhere(ctx, filters);
            return db.evidence.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                select: evidenceListSelect,
                ...(options.take ? { take: options.take } : {}),
            });
        });
    }

    static async listPaginated(db: PrismaTx, ctx: RequestContext, params: EvidenceListParams): Promise<PaginatedResponse<unknown>> {
        return traceRepository('evidence.listPaginated', ctx, async () => {
            const limit = clampLimit(params.limit);
            const where = EvidenceRepository._buildWhere(ctx, params.filters);

            // Apply cursor
            const cursorWhere = buildCursorWhere(params.cursor);
            if (cursorWhere) {
                if (where.AND) {
                    (where.AND as Prisma.EvidenceWhereInput[]).push(cursorWhere as Prisma.EvidenceWhereInput);
                } else {
                    where.AND = [cursorWhere as Prisma.EvidenceWhereInput];
                }
            }

            const items = await db.evidence.findMany({
                where,
                orderBy: CURSOR_ORDER_BY,
                take: limit + 1,
                select: evidenceListSelect,
            });

            const { trimmedItems, nextCursor, hasNextPage } = computePageInfo(items, limit);
            return { items: trimmedItems, pageInfo: { nextCursor, hasNextPage } };
        });
    }

    private static _buildWhere(ctx: RequestContext, filters?: EvidenceListFilters): Prisma.EvidenceWhereInput {
        const where: Prisma.EvidenceWhereInput = { tenantId: ctx.tenantId };
        const andConditions: Prisma.EvidenceWhereInput[] = [];

        if (filters?.type) {
            where.type = filters.type as Prisma.EnumEvidenceTypeFilter;
        }
        if (filters?.status) {
            where.status = filters.status as Prisma.EnumEvidenceStatusFilter;
        }
        if (filters?.controlId) {
            where.controlId = filters.controlId;
        }
        if (filters?.folder) {
            // B8 follow-up — `__none__` matches rows with a NULL
            // or empty-string folder; any other value is exact.
            if (filters.folder === '__none__') {
                where.OR = [
                    { folder: null },
                    { folder: '' },
                ];
            } else {
                where.folder = filters.folder;
            }
        }
        if (filters?.archived !== undefined) {
            where.isArchived = filters.archived;
        }
        if (filters?.expiring) {
            // Evidence expiring within 30 days
            const soon = new Date();
            soon.setDate(soon.getDate() + 30);
            where.retentionUntil = { lte: soon };
        }
        if (filters?.q) {
            andConditions.push({
                OR: [
                    { title: { contains: filters.q, mode: 'insensitive' } },
                    { content: { contains: filters.q, mode: 'insensitive' } },
                    { fileName: { contains: filters.q, mode: 'insensitive' } },
                ],
            });
        }

        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        return where;
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return traceRepository('evidence.getById', ctx, async () => {
            return db.evidence.findFirst({
                where: { id, tenantId: ctx.tenantId },
                include: {
                    control: true,
                    // Source task / risk / asset — powers the "uploaded
                    // from" back-reference on the evidence detail sheet.
                    task: { select: { id: true, key: true, title: true } },
                    risk: { select: { id: true, key: true, title: true } },
                    asset: { select: { id: true, key: true, name: true } },
                    reviews: { include: { reviewer: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
                    // EP-2 — file metadata (name/size/MIME/SHA-256 +
                    // retention) powering the detail sheet's inline
                    // preview, download affordance, and metadata block.
                    fileRecord: {
                        select: {
                            id: true,
                            originalName: true,
                            mimeType: true,
                            sizeBytes: true,
                            sha256: true,
                            retentionUntil: true,
                        },
                    },
                },
            });
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: Omit<Prisma.EvidenceUncheckedCreateInput, 'tenantId'>) {
        return traceRepository('evidence.create', ctx, async () => {
            return db.evidence.create({
                data: {
                    ...data,
                    tenantId: ctx.tenantId,
                },
            });
        });
    }

    static async update(db: PrismaTx, ctx: RequestContext, id: string, data: Omit<Prisma.EvidenceUncheckedUpdateInput, 'tenantId'>) {
        const existing = await this.getById(db, ctx, id);
        if (!existing) return null;

        return db.evidence.update({
            where: { id },
            data,
        });
    }

    static async addReview(db: PrismaTx, ctx: RequestContext, evidenceId: string, action: 'SUBMITTED' | 'APPROVED' | 'REJECTED', comment?: string | null) {
        return db.evidenceReview.create({
            data: {
                tenantId: ctx.tenantId,
                evidenceId,
                reviewerId: ctx.userId,
                action,
                comment,
            },
        });
    }

    /**
     * Segregation-of-duties source: for each evidence id, the reviewer
     * who last SUBMITTED it. One `findMany` (newest-first) reduced into a
     * per-evidence map — no per-id read (query-shape guardrails). Rows
     * without a SUBMITTED review are simply absent from the map; the
     * caller falls back to `Evidence.ownerUserId`.
     */
    static async getLatestSubmitters(
        db: PrismaTx,
        ctx: RequestContext,
        evidenceIds: string[],
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (evidenceIds.length === 0) return map;
        const reviews = await db.evidenceReview.findMany({ // guardrail-allow: unbounded
            where: {
                tenantId: ctx.tenantId,
                evidenceId: { in: evidenceIds },
                action: 'SUBMITTED',
            },
            select: { evidenceId: true, reviewerId: true },
            orderBy: { createdAt: 'desc' },
        });
        // Newest-first ⇒ the first row seen per evidence is the latest.
        for (const r of reviews) {
            if (!map.has(r.evidenceId)) map.set(r.evidenceId, r.reviewerId);
        }
        return map;
    }

    /** Fetch the tenant's evidence for the given ids (bulk-action audit source). */
    static async listByIds(db: PrismaTx, ctx: RequestContext, ids: string[]) {
        // Bounded by the `in: ids` set (bulk schemas cap at 100 ids); a `take:`
        // would be redundant.
        return db.evidence.findMany({ // guardrail-allow: unbounded
            where: { id: { in: ids }, tenantId: ctx.tenantId },
        });
    }

    /**
     * Tenant-scoped bulk update — one `updateMany` so the bulk-action path
     * never reads/writes per-id in a loop. Returns the affected-row count.
     */
    static async bulkUpdate(
        db: PrismaTx,
        ctx: RequestContext,
        ids: string[],
        data: Omit<Prisma.EvidenceUncheckedUpdateInput, 'tenantId'>,
    ) {
        return db.evidence.updateMany({
            where: { id: { in: ids }, tenantId: ctx.tenantId },
            data,
        });
    }
}
