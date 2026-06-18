/**
 * Compliance Trends — Retrieval Layer
 *
 * Provides trend queries for the executive dashboard:
 *  - 90-day KPI time series
 *  - Configurable date range
 *  - Tenant-scoped via RLS
 *
 * @module app-layer/usecases/compliance-trends
 */
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import type { ComplianceSnapshot } from '@prisma/client';

// ─── DTO ────────────────────────────────────────────────────────────

/**
 * A single trend data point — one day's snapshot.
 * Returned as a flat object suitable for charting libraries.
 */
export interface TrendDataPoint {
    /** ISO date string (YYYY-MM-DD) */
    date: string;

    // Controls
    controlCoveragePercent: number;
    controlsTotal: number;
    controlsImplemented: number;
    controlsApplicable: number;
    controlsInProgress: number;
    controlsNotStarted: number;

    // Risks
    risksTotal: number;
    risksOpen: number;
    risksCritical: number;
    risksHigh: number;
    // KPI-card metrics — nullable (null on pre-existence snapshot rows). The
    // chart pipeline trims the NULL prefix so the sparkline is truthful.
    risksAvgScore: number | null;
    risksOverdueReview: number | null;

    // Evidence
    evidenceTotal: number;
    evidenceOverdue: number;
    evidenceDueSoon7d: number;
    evidenceCurrent: number;
    // Status buckets — nullable: null on pre-existence snapshot rows (no data
    // to plot), real counts going forward. The chart pipeline trims the NULL
    // prefix so the sparkline shows only truthful history.
    evidenceDraft: number | null;
    evidenceSubmitted: number | null;
    evidenceApproved: number | null;

    // Policies
    policiesTotal: number;
    policiesOverdueReview: number;
    policiesDraft: number | null;
    policiesInReview: number | null;
    policiesApproved: number | null;

    // Vendors
    vendorsTotal: number;
    vendorsOverdueReview: number;
    vendorsActive: number | null;
    vendorsCritical: number | null;

    // Test plans
    testPlansTotal: number;
    testPlansActive: number | null;
    testPlansPaused: number | null;
    testPlansArchived: number | null;

    // Tasks
    tasksTotal: number;
    tasksOpen: number;
    tasksOverdue: number;
    tasksDueSoon7d: number | null;

    // Assets
    assetsTotal: number;
    assetsActive: number;
    assetsHighCriticality: number;
    assetsRetired: number;

    // Findings
    findingsOpen: number;
}

/**
 * Complete trend payload.
 */
export interface TrendPayload {
    /** Ordered array of data points, oldest first */
    dataPoints: TrendDataPoint[];
    /** Number of days requested */
    daysRequested: number;
    /** Number of data points returned (may be < daysRequested if snapshots are missing) */
    daysAvailable: number;
    /** ISO 8601 range start */
    rangeStart: string;
    /** ISO 8601 range end */
    rangeEnd: string;
}

// ─── Conversion ─────────────────────────────────────────────────────

/**
 * Convert a Prisma ComplianceSnapshot row to a chart-friendly DTO.
 */
function toDataPoint(s: ComplianceSnapshot): TrendDataPoint {
    return {
        date: s.snapshotDate.toISOString().slice(0, 10),
        controlCoveragePercent: s.controlCoverageBps / 10,
        controlsTotal: s.controlsTotal,
        controlsImplemented: s.controlsImplemented,
        controlsApplicable: s.controlsApplicable,
        controlsInProgress: s.controlsInProgress,
        controlsNotStarted: s.controlsNotStarted,
        risksTotal: s.risksTotal,
        risksOpen: s.risksOpen,
        risksCritical: s.risksCritical,
        risksHigh: s.risksHigh,
        risksAvgScore: s.risksAvgScore,
        risksOverdueReview: s.risksOverdueReview,
        evidenceTotal: s.evidenceTotal,
        evidenceOverdue: s.evidenceOverdue,
        evidenceDueSoon7d: s.evidenceDueSoon7d,
        evidenceCurrent: s.evidenceCurrent,
        evidenceDraft: s.evidenceDraft,
        evidenceSubmitted: s.evidenceSubmitted,
        evidenceApproved: s.evidenceApproved,
        policiesTotal: s.policiesTotal,
        policiesOverdueReview: s.policiesOverdueReview,
        policiesDraft: s.policiesDraft,
        policiesInReview: s.policiesInReview,
        policiesApproved: s.policiesApproved,
        vendorsTotal: s.vendorsTotal,
        vendorsOverdueReview: s.vendorsOverdueReview,
        vendorsActive: s.vendorsActive,
        vendorsCritical: s.vendorsCritical,
        testPlansTotal: s.testPlansTotal,
        testPlansActive: s.testPlansActive,
        testPlansPaused: s.testPlansPaused,
        testPlansArchived: s.testPlansArchived,
        tasksTotal: s.tasksTotal,
        tasksOpen: s.tasksOpen,
        tasksOverdue: s.tasksOverdue,
        tasksDueSoon7d: s.tasksDueSoon7d,
        assetsTotal: s.assetsTotal,
        assetsActive: s.assetsActive,
        assetsHighCriticality: s.assetsHighCriticality,
        assetsRetired: s.assetsRetired,
        findingsOpen: s.findingsOpen,
    };
}

// ─── Usecase ────────────────────────────────────────────────────────

/**
 * Retrieve compliance trend data for the last N days.
 *
 * Uses the ComplianceSnapshot table — no live aggregation from
 * operational tables. Fast O(days) query on the composite index.
 *
 * @param ctx — tenant-scoped request context
 * @param days — number of days of history (default: 90, max: 365)
 * @returns ordered trend data points
 */
export async function getComplianceTrends(
    ctx: RequestContext,
    days: number = 90,
): Promise<TrendPayload> {
    assertCanRead(ctx);

    const effectiveDays = Math.min(Math.max(days, 1), 365);
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd.getTime() - effectiveDays * 86400000);

    // Zero out times for clean date comparison
    rangeStart.setUTCHours(0, 0, 0, 0);
    rangeEnd.setUTCHours(23, 59, 59, 999);

    return runInTenantContext(ctx, async (db) => {
        const snapshots = await db.complianceSnapshot.findMany({
            where: {
                tenantId: ctx.tenantId,
                snapshotDate: {
                    gte: rangeStart,
                    lte: rangeEnd,
                },
            },
            orderBy: { snapshotDate: 'asc' },
        });

        const dataPoints = snapshots.map(toDataPoint);

        return {
            dataPoints,
            daysRequested: effectiveDays,
            daysAvailable: dataPoints.length,
            rangeStart: rangeStart.toISOString(),
            rangeEnd: rangeEnd.toISOString(),
        };
    });
}
