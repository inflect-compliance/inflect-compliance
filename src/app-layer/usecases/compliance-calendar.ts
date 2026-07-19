/**
 * Epic 49 — `getComplianceCalendarEvents` usecase.
 *
 * Single aggregation that fans out across the date-bearing entities and
 * normalises every result into the unified `CalendarEvent` shape:
 *
 *   - Evidence            (nextReviewDate)
 *   - Policy              (nextReviewAt)
 *   - Vendor              (nextReviewAt, contractRenewalAt)
 *   - VendorDocument      (validTo)
 *   - VendorAssessment    (nextReviewAt)
 *   - AuditCycle          (periodStartAt → periodEndAt — the only duration source today)
 *   - Control             (nextDueAt)
 *   - ControlTestPlan     (nextDueAt)
 *   - ControlException    (expiresAt)
 *   - AccessReview        (dueAt)
 *   - TrainingAssignment  (dueAt)
 *   - IncidentNotification(dueAt — the NIS2 Art.23 notification SLA)
 *   - Task                (dueAt)
 *   - Risk                (nextReviewAt, targetDate)
 *   - Finding             (dueDate)
 *   - RiskTreatmentPlan   (targetDate) + TreatmentMilestone (dueDate)
 *
 * Deliberately OUT of scope — `ReportSchedule.nextRunAt`. It is a system
 * automation trigger ("the platform will generate this report"), not an
 * obligation a person can miss or act on; putting it beside real
 * deadlines would dilute "what's due". Revisit only if scheduled reports
 * gain a human approval step.
 *
 * `Evidence.expiredAt` is likewise NOT a source: the retention job stamps
 * it at the moment of expiry, so it is a past-tense receipt rather than a
 * forward deadline. `nextReviewDate` is the evidence deadline.
 *
 * Tenant isolation: every Prisma query starts with `tenantId: ctx.tenantId`.
 *
 * Range bounding: the schema guarantees `from <= to <= from + 2y`. Inside
 * the usecase we issue parallel point queries with date predicates so the
 * DB can use the per-entity indexes on the date columns + `(tenantId, …)`.
 *
 * Truncation: each source is capped at `perSourceLimit` (default 500).
 * EVERY loader therefore orders ascending by its date column, so a cap
 * that bites keeps the NEAREST deadlines rather than an arbitrary set the
 * planner happened to return. A capped source reports itself so the
 * response can say so out loud instead of silently under-reporting —
 * see `CalendarSourceResult.capped` and `CalendarResponse.truncation`.
 *
 * Status mapping: each source maps its lifecycle status into one of
 * `scheduled | due_soon | overdue | done | unknown`. The map is local
 * to the source (one place to look when a new entity is added).
 */

import { runInTenantContext } from '@/lib/db-context';
import type { PrismaTx } from '@/lib/db-context';
import { assertCanRead } from '../policies/common';
import { TERMINAL_WORK_ITEM_STATUSES } from '../domain/work-item-status';
import {
    evidenceExpiryScopeWhere,
    EVIDENCE_REVIEWED_STATUS,
} from '../domain/evidence-expiry';
import { urgencyFromDate } from '@/lib/urgency';
import type { WorkItemStatus } from '@prisma/client';
import type { RequestContext } from '../types';
import {
    type CalendarEvent,
    type CalendarEventCategory,
    type CalendarEventStatus,
    type CalendarEventType,
    type CalendarResponse,
    type CalendarSourceName,
    CALENDAR_EVENT_CATEGORIES,
    CALENDAR_EVENT_STATUSES,
} from '../schemas/calendar.schemas';

// ─── Public entry point ──────────────────────────────────────────────

export interface GetCalendarEventsInput {
    from: Date;
    to: Date;
    /** Optional filter — when set, only these types are returned. */
    types?: ReadonlyArray<CalendarEventType>;
    /** Optional filter — when set, only these categories are returned. */
    categories?: ReadonlyArray<CalendarEventCategory>;
    /** Override "now" for tests. Default: new Date(). */
    now?: Date;
    /**
     * Per-source result cap. Default: 500. Stops a runaway entity (one
     * tenant with 50k overdue tasks) from overwhelming the response.
     */
    perSourceLimit?: number;
}

/**
 * What one loader hands back. `capped` is true when the source returned
 * exactly `limit` rows — i.e. there are almost certainly more deadlines
 * past the cap. Because every loader orders by its date column ascending,
 * the ones that survived truncation are the NEAREST ones; the ones hidden
 * are further out.
 */
interface CalendarSourceResult {
    events: CalendarEvent[];
    capped: boolean;
}

/**
 * Wrap a loader's mapped events with the truncation signal. `rowCount` is
 * the number of DB ROWS (not events) — a source like Vendor emits two
 * events per row, so events.length is not the right thing to compare.
 */
function sourceResult(
    events: CalendarEvent[],
    rowCount: number,
    limit: number,
): CalendarSourceResult {
    return { events, capped: rowCount >= limit };
}

export async function getComplianceCalendarEvents(
    ctx: RequestContext,
    input: GetCalendarEventsInput,
): Promise<CalendarResponse> {
    assertCanRead(ctx);

    const now = input.now ?? new Date();
    const limit = input.perSourceLimit ?? 500;
    const range = { from: input.from, to: input.to };

    // Fan-out to every source in parallel inside one tenant-bound
    // transaction. `runInTenantContext` binds the per-tx `app_user`
    // role + sets `app.tenant_id` so every read goes through the
    // RLS policies — that's belt-and-braces with the explicit
    // `tenantId: ctx.tenantId` filter inside each loader.
    // Every entry is `[sourceName, loader]`. The name is what the response
    // reports as capped, so it must stay stable — the UI shows it.
    const sources: ReadonlyArray<
        readonly [CalendarSourceName, (db: PrismaTx) => Promise<CalendarSourceResult>]
    > = [
        ['evidence', (db) => loadEvidenceEvents(db, ctx, range, now, limit)],
        ['policy', (db) => loadPolicyEvents(db, ctx, range, now, limit)],
        ['vendor', (db) => loadVendorEvents(db, ctx, range, now, limit)],
        ['vendor-document', (db) => loadVendorDocumentEvents(db, ctx, range, now, limit)],
        ['vendor-assessment', (db) => loadVendorAssessmentEvents(db, ctx, range, now, limit)],
        ['audit-cycle', (db) => loadAuditCycleEvents(db, ctx, range, now, limit)],
        ['control', (db) => loadControlEvents(db, ctx, range, now, limit)],
        ['control-test-plan', (db) => loadTestPlanEvents(db, ctx, range, now, limit)],
        ['control-exception', (db) => loadControlExceptionEvents(db, ctx, range, now, limit)],
        ['access-review', (db) => loadAccessReviewEvents(db, ctx, range, now, limit)],
        ['training', (db) => loadTrainingEvents(db, ctx, range, now, limit)],
        ['incident-notification', (db) => loadIncidentNotificationEvents(db, ctx, range, now, limit)],
        ['task', (db) => loadTaskEvents(db, ctx, range, now, limit)],
        ['risk', (db) => loadRiskEvents(db, ctx, range, now, limit)],
        ['finding', (db) => loadFindingEvents(db, ctx, range, now, limit)],
        // Epic G-7 — milestones contribute one event per milestone;
        // plans contribute one per non-completed plan target.
        ['treatment-milestone', (db) => loadTreatmentMilestoneEvents(db, ctx, range, now, limit)],
        ['treatment-plan', (db) => loadTreatmentPlanEvents(db, ctx, range, now, limit)],
    ] as const;

    const results = await runInTenantContext(ctx, (db) =>
        Promise.all(sources.map(([, load]) => load(db))),
    );

    // Which sources hit their cap — i.e. where the user is being shown the
    // nearest N and NOT told about the rest unless we say so.
    const cappedSources = sources
        .map(([name], i) => (results[i].capped ? name : null))
        .filter((n): n is CalendarSourceName => n !== null);

    let all: CalendarEvent[] = results.flatMap((r) => r.events);

    // Apply the type / category filter post-aggregation. The per-source
    // queries don't filter by type because most sources contribute one
    // type only; pushing the predicate up keeps the loaders simple.
    if (input.types && input.types.length > 0) {
        const allowed = new Set<string>(input.types);
        all = all.filter((e) => allowed.has(e.type));
    }
    if (input.categories && input.categories.length > 0) {
        const allowed = new Set<string>(input.categories);
        all = all.filter((e) => allowed.has(e.category));
    }

    // Stable order: ascending by date — heatmap + month rendering
    // consumes events in chronological order.
    all.sort((a, b) => a.date.localeCompare(b.date));

    return {
        events: all,
        // `partial` propagates the truncation into the summary so the UI
        // never presents a post-truncation undercount as authoritative.
        counts: { ...countSummaries(all), partial: cappedSources.length > 0 },
        truncation: {
            capped: cappedSources.length > 0,
            sources: cappedSources,
            perSourceLimit: limit,
        },
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
        },
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface DateRange {
    from: Date;
    to: Date;
}

/**
 * Map a date+status into a calendar status. `now` is the comparison
 * anchor. `done`/`scheduled` are decided by the caller's domain logic
 * and pass through verbatim.
 *
 * The due-soon window comes from the shared `URGENCY_DAYS` scale rather
 * than a local literal — the calendar's `due_soon` IS the product-wide
 * `urgent` level, and it used to disagree with the dashboard's copy of
 * the same idea.
 */
function classifyStatus(
    eventDate: Date,
    now: Date,
    isDone: boolean,
): CalendarEventStatus {
    if (isDone) return 'done';
    const urgency = urgencyFromDate(eventDate, now);
    if (urgency === 'overdue') return 'overdue';
    if (urgency === 'urgent') return 'due_soon';
    return 'scheduled';
}

function tenantHrefFromCtx(ctx: RequestContext, path: string): string {
    // Usecases don't know the slug, only the tenantId. The route handler
    // resolves slug; we leave a `/t/{slug}` placeholder that the route
    // handler rewrites. Keeping it server-side stops every UI from
    // re-implementing the same prefix.
    if (!ctx.tenantSlug) return path;
    return `/t/${ctx.tenantSlug}${path.startsWith('/') ? path : `/${path}`}`;
}

function countSummaries(events: CalendarEvent[]) {
    const byCategory: Record<CalendarEventCategory, number> = Object.fromEntries(
        CALENDAR_EVENT_CATEGORIES.map((c) => [c, 0]),
    ) as Record<CalendarEventCategory, number>;
    const byStatus: Record<CalendarEventStatus, number> = Object.fromEntries(
        CALENDAR_EVENT_STATUSES.map((s) => [s, 0]),
    ) as Record<CalendarEventStatus, number>;
    for (const e of events) {
        byCategory[e.category]++;
        byStatus[e.status]++;
    }
    return { total: events.length, byCategory, byStatus };
}

// ─── Per-source loaders ──────────────────────────────────────────────

async function loadEvidenceEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.evidence.findMany({
        where: {
            // Shared expiry scope — soft-deleted + archived evidence is
            // gone, so a review deadline for it is a phantom. This is the
            // same predicate the dashboard's ExpiryCalendar + KPI use.
            ...evidenceExpiryScopeWhere(ctx.tenantId),
            nextReviewDate: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            nextReviewDate: true,
            status: true,
            ownerUserId: true,
        },
        orderBy: { nextReviewDate: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.nextReviewDate)
        .map((r): CalendarEvent => {
            const date = r.nextReviewDate as Date;
            const isDone = r.status === EVIDENCE_REVIEWED_STATUS && date > now;
            return {
                id: `EVIDENCE:${r.id}:evidence-review`,
                type: 'evidence-review',
                category: 'evidence',
                title: `Evidence review: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'EVIDENCE',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/evidence/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadPolicyEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.policy.findMany({
        where: {
            tenantId: ctx.tenantId,
            nextReviewAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            nextReviewAt: true,
            status: true,
        },
        orderBy: { nextReviewAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.nextReviewAt)
        .map((r): CalendarEvent => {
            const date = r.nextReviewAt as Date;
            const isDone = r.status === 'ARCHIVED';
            return {
                id: `POLICY:${r.id}:policy-review`,
                type: 'policy-review',
                category: 'policy',
                title: `Policy review: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'POLICY',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/policies/${r.id}`),
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadVendorEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.vendor.findMany({
        where: {
            tenantId: ctx.tenantId,
            OR: [
                { nextReviewAt: { not: null, gte: range.from, lte: range.to } },
                {
                    contractRenewalAt: {
                        not: null,
                        gte: range.from,
                        lte: range.to,
                    },
                },
            ],
        },
        select: {
            id: true,
            name: true,
            nextReviewAt: true,
            contractRenewalAt: true,
            status: true,
            ownerUserId: true,
        },
        // Two date columns feed this source, so "nearest first" is
        // approximate: order by review date then renewal date. Postgres
        // sorts NULLs last on ASC, which is what we want — a row matching
        // only on the second column sorts after the rows matching the
        // first, and both stay ahead of anything outside the range.
        orderBy: [{ nextReviewAt: 'asc' }, { contractRenewalAt: 'asc' }],
        take: limit,
    });
    const events: CalendarEvent[] = [];
    for (const r of rows) {
        const isOffboarded = r.status === 'OFFBOARDED';
        if (
            r.nextReviewAt &&
            r.nextReviewAt >= range.from &&
            r.nextReviewAt <= range.to
        ) {
            events.push({
                id: `VENDOR:${r.id}:vendor-review`,
                type: 'vendor-review',
                category: 'vendor',
                title: `Vendor review: ${r.name}`,
                date: r.nextReviewAt.toISOString(),
                status: classifyStatus(r.nextReviewAt, now, isOffboarded),
                entityType: 'VENDOR',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/vendors/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            });
        }
        if (
            r.contractRenewalAt &&
            r.contractRenewalAt >= range.from &&
            r.contractRenewalAt <= range.to
        ) {
            events.push({
                id: `VENDOR:${r.id}:vendor-renewal`,
                type: 'vendor-renewal',
                category: 'vendor',
                title: `Contract renewal: ${r.name}`,
                date: r.contractRenewalAt.toISOString(),
                status: classifyStatus(
                    r.contractRenewalAt,
                    now,
                    isOffboarded,
                ),
                entityType: 'VENDOR',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/vendors/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            });
        }
    }
    return sourceResult(events, rows.length, limit);
}

async function loadVendorDocumentEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.vendorDocument.findMany({
        where: {
            tenantId: ctx.tenantId,
            validTo: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            type: true,
            validTo: true,
            vendorId: true,
            vendor: { select: { name: true } },
        },
        orderBy: { validTo: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.validTo)
        .map((r): CalendarEvent => {
            const date = r.validTo as Date;
            return {
                id: `VENDOR_DOCUMENT:${r.id}:vendor-document-expiry`,
                type: 'vendor-document-expiry',
                category: 'vendor',
                title: `${r.type} expires: ${r.vendor.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, false),
                entityType: 'VENDOR_DOCUMENT',
                entityId: r.id,
                // Land on the Documents tab, not the vendor root — the
                // expiring document is what the user came for.
                href: tenantHrefFromCtx(
                    ctx,
                    `/vendors/${r.vendorId}?tab=documents`,
                ),
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadAuditCycleEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    // AuditCycle is the only duration source today: emits an event with
    // `start` (periodStartAt) and `end` (periodEndAt). Either bound
    // intersecting the queried range surfaces the cycle.
    const rows = await db.auditCycle.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            OR: [
                { periodStartAt: { gte: range.from, lte: range.to } },
                { periodEndAt: { gte: range.from, lte: range.to } },
                {
                    AND: [
                        { periodStartAt: { lte: range.from } },
                        { periodEndAt: { gte: range.to } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            name: true,
            frameworkKey: true,
            periodStartAt: true,
            periodEndAt: true,
            status: true,
        },
        // Cycles are ranges; order by the start bound so a cap keeps the
        // cycles beginning soonest. Straddling cycles (start before the
        // window) sort first, which is correct — they are already running.
        orderBy: [{ periodStartAt: 'asc' }, { periodEndAt: 'asc' }],
        take: limit,
    });
    const events = rows
        .filter((r) => r.periodStartAt || r.periodEndAt)
        .map((r): CalendarEvent => {
            const start = r.periodStartAt ?? r.periodEndAt!;
            const end =
                r.periodEndAt && r.periodStartAt && r.periodEndAt !== r.periodStartAt
                    ? r.periodEndAt
                    : undefined;
            const isDone = r.status === 'COMPLETE';
            return {
                id: `AUDIT_CYCLE:${r.id}:audit-cycle`,
                type: 'audit-cycle',
                category: 'audit',
                title: `Audit cycle: ${r.name}`,
                date: start.toISOString(),
                end: end?.toISOString(),
                status: classifyStatus(end ?? start, now, isDone),
                entityType: 'AUDIT_CYCLE',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/audits/cycles/${r.id}`),
                detail: r.frameworkKey,
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadControlEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.control.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            applicability: 'APPLICABLE',
            nextDueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            name: true,
            nextDueAt: true,
            status: true,
            ownerUserId: true,
        },
        orderBy: { nextDueAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.nextDueAt)
        .map((r): CalendarEvent => {
            const date = r.nextDueAt as Date;
            const isDone = r.status === 'IMPLEMENTED';
            return {
                id: `CONTROL:${r.id}:control-review`,
                type: 'control-review',
                category: 'control',
                title: `Control review: ${r.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'CONTROL',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/controls/${r.id}`),
                ownerUserId: r.ownerUserId ?? undefined,
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadTestPlanEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.controlTestPlan.findMany({
        where: {
            tenantId: ctx.tenantId,
            status: 'ACTIVE',
            nextDueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            name: true,
            nextDueAt: true,
            controlId: true,
            control: { select: { name: true } },
        },
        orderBy: { nextDueAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.nextDueAt)
        .map((r): CalendarEvent => {
            const date = r.nextDueAt as Date;
            return {
                id: `CONTROL_TEST_PLAN:${r.id}:control-test-due`,
                type: 'control-test-due',
                category: 'control',
                title: `Test due: ${r.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, false),
                entityType: 'CONTROL_TEST_PLAN',
                entityId: r.id,
                href: tenantHrefFromCtx(
                    ctx,
                    `/controls/${r.controlId}/tests/${r.id}`,
                ),
                detail: r.control.name,
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadTaskEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.task.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            dueAt: true,
            status: true,
            assigneeUserId: true,
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.dueAt)
        .map((r): CalendarEvent => {
            const date = r.dueAt as Date;
            const isDone =
                r.status === 'RESOLVED' ||
                r.status === 'CLOSED' ||
                r.status === 'CANCELED';
            return {
                id: `TASK:${r.id}:task-due`,
                type: 'task-due',
                category: 'task',
                title: `Task due: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'TASK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/tasks/${r.id}`),
                ownerUserId: r.assigneeUserId ?? undefined,
            };
        });
    return sourceResult(events, rows.length, limit);
}

async function loadRiskEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.risk.findMany({
        where: {
            tenantId: ctx.tenantId,
            OR: [
                { nextReviewAt: { not: null, gte: range.from, lte: range.to } },
                { targetDate: { not: null, gte: range.from, lte: range.to } },
            ],
        },
        select: {
            id: true,
            title: true,
            nextReviewAt: true,
            targetDate: true,
            status: true,
        },
        // Two date columns (see the vendor loader for the same shape) —
        // review date leads, target date breaks the tie.
        orderBy: [{ nextReviewAt: 'asc' }, { targetDate: 'asc' }],
        take: limit,
    });
    const events: CalendarEvent[] = [];
    for (const r of rows) {
        const isClosed = r.status === 'CLOSED' || r.status === 'ACCEPTED';
        if (
            r.nextReviewAt &&
            r.nextReviewAt >= range.from &&
            r.nextReviewAt <= range.to
        ) {
            events.push({
                id: `RISK:${r.id}:risk-review`,
                type: 'risk-review',
                category: 'risk',
                title: `Risk review: ${r.title}`,
                date: r.nextReviewAt.toISOString(),
                status: classifyStatus(r.nextReviewAt, now, isClosed),
                entityType: 'RISK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/risks/${r.id}`),
            });
        }
        if (
            r.targetDate &&
            r.targetDate >= range.from &&
            r.targetDate <= range.to
        ) {
            events.push({
                id: `RISK:${r.id}:risk-target`,
                type: 'risk-target',
                category: 'risk',
                title: `Risk mitigation target: ${r.title}`,
                date: r.targetDate.toISOString(),
                status: classifyStatus(r.targetDate, now, isClosed),
                entityType: 'RISK',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/risks/${r.id}`),
            });
        }
    }
    return sourceResult(events, rows.length, limit);
}

async function loadFindingEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.finding.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueDate: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            owner: true,
        },
        orderBy: { dueDate: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.dueDate)
        .map((r): CalendarEvent => {
            const date = r.dueDate as Date;
            const isDone = r.status === 'CLOSED';
            return {
                id: `FINDING:${r.id}:finding-due`,
                type: 'finding-due',
                category: 'finding',
                title: `Finding due: ${r.title}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'FINDING',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/findings/${r.id}`),
                ownerUserId: r.owner ?? undefined,
            };
        });
    return sourceResult(events, rows.length, limit);
}

// ─── Lightweight badge query ─────────────────────────────────────────

/**
 * Cheap count of the caller's tasks that NEED ATTENTION, used by the
 * sidebar Calendar nav badge.
 *
 * Scope is deliberately narrow and personal — "how much is on *my*
 * plate", not "how many tenant deadlines exist". The Calendar PAGE is
 * tenant-wide across every source; this badge is not, so the UI labels it
 * explicitly as my-tasks (see the `calendarBadgeLabel` copy) rather than
 * letting a user read a small number as "the tenant is fine".
 *
 *   - Tasks ONLY — not controls / evidence / policies / vendors. Counting
 *     16 sources on every sidebar render would be a fan-out per page view;
 *     the page owns the tenant-wide view.
 *   - Assigned to the caller (`assigneeUserId = ctx.userId`).
 *   - OVERDUE **and** upcoming. Overdue used to be excluded (`dueAt > now`),
 *     which meant a user whose work was entirely late saw an EMPTY badge —
 *     the worst possible state rendered as the calmest. "Needs attention"
 *     has to include the things that are already late.
 *   - Non-terminal status (open work only).
 *
 * `horizonDays` caps the FUTURE side only; overdue is always included
 * regardless of horizon, because an old overdue task doesn't stop needing
 * attention just because the caller asked for a 7-day view.
 *
 * Caps at `MAX_BADGE_COUNT` so the badge never renders a huge number that's
 * effectively noise (we render `99+` past the cap on the UI side). Returns 0
 * when nothing needs attention — the sidebar hook then hides the badge.
 */
const MAX_BADGE_COUNT = 99;

export async function getUpcomingDeadlineCount(
    ctx: RequestContext,
    options: { now?: Date; horizonDays?: number } = {},
): Promise<number> {
    assertCanRead(ctx);
    const now = options.now ?? new Date();
    // Overdue is ALWAYS in scope (no lower bound) — the badge means "needs
    // attention", and late work needs it most. `horizonDays` caps only how
    // far FORWARD we look, so a 7-day horizon reads as "everything late,
    // plus the next week" rather than hiding a backlog.
    const dueAt =
        options.horizonDays != null
            ? {
                  not: null,
                  lte: new Date(now.getTime() + options.horizonDays * 86_400_000),
              }
            : { not: null };

    // Count, don't fetch — we only need a number for the badge. The
    // `take: MAX_BADGE_COUNT + 1` pattern lets us know if the real
    // number exceeds the cap without doing a full COUNT. Wrapped in
    // `runInTenantContext` so the read goes through RLS-bound `app_user`.
    const tasks = await runInTenantContext(ctx, (db) =>
        db.task.count({
            where: {
                tenantId: ctx.tenantId,
                // Personal badge: only the caller's own tasks.
                assigneeUserId: ctx.userId,
                dueAt,
                status: {
                    // Cast through readonly → mutable WorkItemStatus[]
                    // because Prisma's `notIn` rejects the `as const`
                    // literal type, and the shared ACTIVE_STATUS_FILTER
                    // constant types its payload as `string[]` which
                    // Prisma's newer generated client also rejects.
                    notIn: [...TERMINAL_WORK_ITEM_STATUSES] as WorkItemStatus[],
                },
            },
            take: MAX_BADGE_COUNT + 1,
        }),
    );

    return Math.min(MAX_BADGE_COUNT + 1, tasks);
}

// ─── Epic G-7 — treatment plan + milestone calendar loaders ─────────

/**
 * Each non-completed milestone contributes one calendar event keyed
 * by its `dueDate`. Completed milestones surface with status `done`
 * so the heatmap can show "this was on the calendar; here's the
 * receipt". Click-through lands on the parent risk's detail page,
 * scrolled to the treatment-plan card section.
 */
async function loadTreatmentMilestoneEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.treatmentMilestone.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueDate: { gte: range.from, lte: range.to },
            // Skip milestones whose parent plan was soft-deleted or
            // whose linked risk was retired.
            treatmentPlan: { deletedAt: null },
        },
        select: {
            id: true,
            title: true,
            dueDate: true,
            completedAt: true,
            sortOrder: true,
            treatmentPlan: {
                select: {
                    id: true,
                    riskId: true,
                    risk: { select: { title: true } },
                },
            },
        },
        orderBy: { dueDate: 'asc' },
        take: limit,
    });
    const events = rows.map((r): CalendarEvent => {
        const date = r.dueDate;
        const isDone = r.completedAt !== null;
        const riskTitle = r.treatmentPlan?.risk?.title ?? 'Risk';
        return {
            id: `TREATMENT_MILESTONE:${r.id}:treatment-milestone-due`,
            type: 'treatment-milestone-due',
            category: 'risk',
            title: `Milestone: ${r.title}`,
            date: date.toISOString(),
            status: classifyStatus(date, now, isDone),
            entityType: 'TREATMENT_MILESTONE',
            entityId: r.id,
            href: tenantHrefFromCtx(
                ctx,
                `/risks/${r.treatmentPlan?.riskId ?? ''}`,
            ),
            detail: riskTitle,
        };
    });
    return sourceResult(events, rows.length, limit);
}

/**
 * Treatment plans contribute one event per non-completed plan keyed
 * by `targetDate` so the calendar shows the plan-level deadline next
 * to its constituent milestone deadlines.
 */
async function loadTreatmentPlanEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.riskTreatmentPlan.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            status: { in: ['DRAFT', 'ACTIVE', 'OVERDUE'] },
            targetDate: { gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            riskId: true,
            strategy: true,
            targetDate: true,
            risk: { select: { title: true } },
        },
        orderBy: { targetDate: 'asc' },
        take: limit,
    });
    const events = rows.map((r): CalendarEvent => {
        const date = r.targetDate;
        return {
            id: `RISK_TREATMENT_PLAN:${r.id}:treatment-plan-target`,
            type: 'treatment-plan-target',
            category: 'risk',
            title: `Plan target: ${r.risk?.title ?? 'Risk'}`,
            date: date.toISOString(),
            status: classifyStatus(date, now, false),
            entityType: 'RISK_TREATMENT_PLAN',
            entityId: r.id,
            href: tenantHrefFromCtx(ctx, `/risks/${r.riskId}`),
            detail: `${r.strategy} strategy`,
        };
    });
    return sourceResult(events, rows.length, limit);
}

// ─── Deadline sources that already had reminder jobs but no calendar ──
//
// Each of these entities drives a reminder/escalation job, so the platform
// already treated its date as a deadline — the calendar just wasn't
// showing it. Same contract as every loader above: tenant-scoped, ordered
// ascending by the date column, capped, reporting its own truncation.

/**
 * Access-review recertification deadlines (`AccessReview.dueAt`). Backed
 * by `access-review-reminder` + `access-review-overdue-escalation`.
 * A CLOSED review is done; soft-deleted reviews are excluded.
 */
async function loadAccessReviewEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.accessReview.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            dueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            name: true,
            dueAt: true,
            status: true,
            reviewerUserId: true,
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.dueAt)
        .map((r): CalendarEvent => {
            const date = r.dueAt as Date;
            return {
                id: `ACCESS_REVIEW:${r.id}:access-review-due`,
                type: 'access-review-due',
                category: 'audit',
                title: `Access review: ${r.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, r.status === 'CLOSED'),
                entityType: 'ACCESS_REVIEW',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/access-reviews/${r.id}`),
                ownerUserId: r.reviewerUserId,
            };
        });
    return sourceResult(events, rows.length, limit);
}

/**
 * Training assignment due dates (`TrainingAssignment.dueAt`). COMPLETED
 * assignments surface as `done` (the receipt), everything else carries the
 * live deadline.
 */
async function loadTrainingEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.trainingAssignment.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            dueAt: true,
            status: true,
            completedAt: true,
            course: { select: { name: true } },
            employee: { select: { fullName: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.dueAt)
        .map((r): CalendarEvent => {
            const date = r.dueAt as Date;
            const isDone = r.status === 'COMPLETED' || r.completedAt !== null;
            return {
                id: `TRAINING_ASSIGNMENT:${r.id}:training-due`,
                type: 'training-due',
                category: 'task',
                title: `Training due: ${r.course.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, isDone),
                entityType: 'TRAINING_ASSIGNMENT',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/training`),
                // Employee is an HR record, not a platform User (no userId
                // on the model), so there is no ownerUserId to route
                // notifications by — the assignee shows as detail copy.
                detail: r.employee.fullName,
            };
        });
    return sourceResult(events, rows.length, limit);
}

/**
 * Incident-notification SLA deadlines (`IncidentNotification.dueAt`) —
 * the NIS2 Art.23 early-warning / full-notification clock, already driven
 * by the `incident-notification-deadlines` job. SUBMITTED and
 * NOT_REQUIRED are terminal, so they render as `done`.
 *
 * `dueAt` is non-null on this model, so there is no null guard.
 */
async function loadIncidentNotificationEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.incidentNotification.findMany({
        where: {
            tenantId: ctx.tenantId,
            dueAt: { gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            kind: true,
            dueAt: true,
            status: true,
            incidentId: true,
            incident: { select: { title: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
    });
    const events = rows.map((r): CalendarEvent => {
        const isDone = r.status === 'SUBMITTED' || r.status === 'NOT_REQUIRED';
        return {
            id: `INCIDENT_NOTIFICATION:${r.id}:incident-notification-due`,
            type: 'incident-notification-due',
            category: 'finding',
            title: `Incident notification (${r.kind}): ${r.incident.title}`,
            date: r.dueAt.toISOString(),
            status: classifyStatus(r.dueAt, now, isDone),
            entityType: 'INCIDENT_NOTIFICATION',
            entityId: r.id,
            href: tenantHrefFromCtx(ctx, `/incidents/${r.incidentId}`),
        };
    });
    return sourceResult(events, rows.length, limit);
}

/**
 * Control-exception expiry (`ControlException.expiresAt`) — when an
 * accepted exception lapses the control snaps back to non-compliant, so
 * the expiry is a real deadline. Backed by `exception-expiry-monitor`.
 * Only APPROVED exceptions have a live clock; REQUESTED/REJECTED aren't
 * in force and EXPIRED has already lapsed.
 */
async function loadControlExceptionEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.controlException.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            status: 'APPROVED',
            expiresAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            expiresAt: true,
            controlId: true,
            control: { select: { name: true } },
        },
        orderBy: { expiresAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.expiresAt)
        .map((r): CalendarEvent => {
            const date = r.expiresAt as Date;
            return {
                id: `CONTROL_EXCEPTION:${r.id}:control-exception-expiry`,
                type: 'control-exception-expiry',
                category: 'control',
                title: `Exception expires: ${r.control.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, false),
                entityType: 'CONTROL_EXCEPTION',
                entityId: r.id,
                href: tenantHrefFromCtx(ctx, `/controls/${r.controlId}`),
            };
        });
    return sourceResult(events, rows.length, limit);
}

/**
 * Vendor reassessment dates (`VendorAssessment.nextReviewAt`) — distinct
 * from `Vendor.nextReviewAt` (the vendor-level review): this is the date
 * a specific completed assessment falls due for redoing. CLOSED
 * assessments are done.
 */
async function loadVendorAssessmentEvents(
    db: PrismaTx,
    ctx: RequestContext,
    range: DateRange,
    now: Date,
    limit: number,
): Promise<CalendarSourceResult> {
    const rows = await db.vendorAssessment.findMany({
        where: {
            tenantId: ctx.tenantId,
            nextReviewAt: { not: null, gte: range.from, lte: range.to },
        },
        select: {
            id: true,
            nextReviewAt: true,
            status: true,
            vendorId: true,
            vendor: { select: { name: true } },
        },
        orderBy: { nextReviewAt: 'asc' },
        take: limit,
    });
    const events = rows
        .filter((r) => r.nextReviewAt)
        .map((r): CalendarEvent => {
            const date = r.nextReviewAt as Date;
            return {
                id: `VENDOR_ASSESSMENT:${r.id}:vendor-assessment-review`,
                type: 'vendor-assessment-review',
                category: 'vendor',
                title: `Vendor reassessment: ${r.vendor.name}`,
                date: date.toISOString(),
                status: classifyStatus(date, now, r.status === 'CLOSED'),
                entityType: 'VENDOR_ASSESSMENT',
                entityId: r.id,
                href: tenantHrefFromCtx(
                    ctx,
                    `/vendors/${r.vendorId}?tab=assessments`,
                ),
            };
        });
    return sourceResult(events, rows.length, limit);
}
