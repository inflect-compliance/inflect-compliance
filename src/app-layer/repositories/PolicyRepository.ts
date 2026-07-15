import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { Prisma, PolicyStatus } from '@prisma/client';
import { buildCursorWhere, CURSOR_ORDER_BY, computePageInfo, clampLimit } from '@/lib/pagination';
import type { PaginatedResponse } from '@/lib/dto/pagination';

export interface PolicyFilters {
    status?: string;
    category?: string;
    language?: string;
    q?: string;
    /** Review-cycle bucket: 'overdue' (nextReviewAt past) | 'upcoming' (≤30d). */
    reviewBucket?: 'overdue' | 'upcoming';
}

export interface PolicyListParams {
    limit?: number;
    cursor?: string;
    filters?: PolicyFilters;
}

// PR-3 — tight SELECT shape for the Policies list page. Replaces the
// previous `include: { currentVersion: true }` which dragged in the
// (encrypted) `currentVersion.contentText` blob plus several body
// fields the page never reads. Trimmed to exactly what
// PoliciesClient.tsx renders.
const policyListSelect = {
    id: true,
    slug: true,
    title: true,
    description: true,
    status: true,
    category: true,
    nextReviewAt: true,
    updatedAt: true,
    ownerUserId: true,
    lifecycleVersion: true,
    // `createdAt` is required by the cursor-pagination helper
    // (`computePageInfo`) — it's not rendered in the table.
    createdAt: true,
    owner: { select: { id: true, name: true, email: true } },
    currentVersion: { select: { id: true, versionNumber: true } },
    _count: { select: { versions: true, controlLinks: true, approvals: true } },
} as const;

export class PolicyRepository {
    static async list(
        db: PrismaTx,
        ctx: RequestContext,
        filters?: PolicyFilters,
        options: { take?: number } = {},
    ) {
        const where = PolicyRepository._buildWhere(ctx, filters);
        return db.policy.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            select: policyListSelect,
            ...(options.take ? { take: options.take } : {}),
        });
    }

    static async listPaginated(db: PrismaTx, ctx: RequestContext, params: PolicyListParams): Promise<PaginatedResponse<unknown>> {
        const limit = clampLimit(params.limit);
        const where = PolicyRepository._buildWhere(ctx, params.filters);

        const cursorWhere = buildCursorWhere(params.cursor);
        if (cursorWhere) {
            if (where.AND) {
                (where.AND as Prisma.PolicyWhereInput[]).push(cursorWhere as Prisma.PolicyWhereInput);
            } else {
                where.AND = [cursorWhere as Prisma.PolicyWhereInput];
            }
        }

        const items = await db.policy.findMany({
            where,
            orderBy: CURSOR_ORDER_BY,
            take: limit + 1,
            select: policyListSelect,
        });

        const { trimmedItems, nextCursor, hasNextPage } = computePageInfo(items, limit);
        return { items: trimmedItems, pageInfo: { nextCursor, hasNextPage } };
    }

    private static _buildWhere(ctx: RequestContext, filters?: PolicyFilters): Prisma.PolicyWhereInput {
        const where: Prisma.PolicyWhereInput = { tenantId: ctx.tenantId };
        if (filters?.status) where.status = filters.status as Prisma.EnumPolicyStatusFilter;
        if (filters?.category) where.category = filters.category;
        if (filters?.language) where.language = filters.language;
        if (filters?.q) {
            where.OR = [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { description: { contains: filters.q, mode: 'insensitive' } },
            ];
        }
        // Review-cycle bucket. `overdue` = nextReviewAt in the past; `upcoming`
        // = due within the next 30 days. Makes "policies overdue for review"
        // findable from the list (previously only surfaced via email reminders).
        if (filters?.reviewBucket === 'overdue') {
            where.nextReviewAt = { lt: new Date() };
        } else if (filters?.reviewBucket === 'upcoming') {
            const now = new Date();
            const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            where.nextReviewAt = { gte: now, lte: in30 };
        }
        return where;
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.policy.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                currentVersion: {
                    include: {
                        createdBy: { select: { id: true, name: true } },
                    },
                },
                owner: { select: { id: true, name: true, email: true } },
                versions: {
                    orderBy: { versionNumber: 'desc' },
                    include: {
                        createdBy: { select: { id: true, name: true } },
                        approvals: {
                            include: {
                                requestedBy: { select: { id: true, name: true } },
                                approvedBy: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                controlLinks: {
                    include: {
                        control: { select: { id: true, name: true, annexId: true } },
                    },
                },
                evidenceItems: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        evidence: { select: { id: true, title: true, type: true, retentionUntil: true } },
                    },
                },
            },
        });
    }

    static async getBySlug(db: PrismaTx, ctx: RequestContext, slug: string) {
        return db.policy.findFirst({
            where: { slug, tenantId: ctx.tenantId },
        });
    }

    static async create(db: PrismaTx, ctx: RequestContext, data: {
        slug: string;
        title: string;
        description?: string | null;
        category?: string | null;
        ownerUserId?: string | null;
        reviewFrequencyDays?: number | null;
        nextReviewAt?: Date | null;
        language?: string | null;
    }) {
        return db.policy.create({
            data: {
                tenantId: ctx.tenantId,
                slug: data.slug,
                title: data.title,
                description: data.description,
                category: data.category,
                ownerUserId: data.ownerUserId,
                reviewFrequencyDays: data.reviewFrequencyDays,
                nextReviewAt: data.nextReviewAt,
                language: data.language || 'en',
                status: 'DRAFT',
            },
        });
    }

    static async updateMetadata(db: PrismaTx, ctx: RequestContext, id: string, data: {
        title?: string;
        description?: string | null;
        category?: string | null;
        ownerUserId?: string | null;
        reviewFrequencyDays?: number | null;
        nextReviewAt?: Date | null;
        lastReviewedAt?: Date | null;
        language?: string | null;
    }) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data,
        });
    }

    static async updateStatus(db: PrismaTx, ctx: RequestContext, id: string, status: string) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data: { status: status as PolicyStatus },
        });
    }

    static async setCurrentVersion(db: PrismaTx, ctx: RequestContext, id: string, versionId: string | null) {
        return db.policy.updateMany({
            where: { id, tenantId: ctx.tenantId },
            data: { currentVersionId: versionId },
        });
    }

    /** Fetch the tenant's policies for the given ids (bulk-action audit source). */
    static async listByIds(db: PrismaTx, ctx: RequestContext, ids: string[]) {
        // Bounded by the `in: ids` set (bulk schemas cap at 100 ids); a `take:`
        // would be redundant.
        return db.policy.findMany({ // guardrail-allow: unbounded
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
        data: Omit<Prisma.PolicyUncheckedUpdateInput, 'tenantId'>,
    ) {
        return db.policy.updateMany({
            where: { id: { in: ids }, tenantId: ctx.tenantId },
            data,
        });
    }
}
