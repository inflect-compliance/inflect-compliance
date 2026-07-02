/**
 * Compliance-Posture Summary — usecase orchestration.
 *
 * Gathers an AGGREGATE, tenant-scoped signals snapshot from EXISTING
 * usecases (the executive dashboard + framework coverage), runs it through
 * the configured provider (stub by default, opt-in LLM), guards the output,
 * and upserts the single cached `CompliancePostureSummary` row per tenant.
 *
 * The dashboard hero reads the cached row cheaply via `getLatestPostureSummary`
 * — the LLM is NEVER called on the render path, only here (daily cron) and via
 * the explicit regenerate endpoint.
 *
 * @module app-layer/usecases/compliance-posture
 */
import { Prisma, type CompliancePostureSummary } from '@prisma/client';
import { RequestContext } from '../types';
import { prisma } from '@/lib/prisma';
import { runInTenantContext } from '@/lib/db-context';
import { getPermissionsForRole } from '@/lib/permissions';
import { assertCanRead } from '../policies/common';
import { getExecutiveDashboard } from './dashboard';
import { listFrameworks } from './framework';
import { getCompliancePostureProvider } from '../ai/compliance-posture/provider';
import { applyPostureOutputGuard } from '../ai/compliance-posture/output-guard';
import { describePayload } from '../ai/compliance-posture/privacy';
import type {
    AdvicePriority,
    FrameworkCoverageSignal,
    PostureAdviceItem,
    PostureLabel,
    PostureSummaryInput,
    PostureSummaryResult,
} from '../ai/compliance-posture/types';
import { POSTURE_LABELS } from '../ai/compliance-posture/types';
import { logger } from '@/lib/observability/logger';

/**
 * Serializable projection of the cached row for the dashboard hero. Keeps the
 * client component free of Prisma types and normalises the JSON columns into
 * typed shapes (a client may `import type` this without pulling server code).
 */
export interface PostureSummaryDto {
    postureLabel: PostureLabel;
    maturityScore: number | null;
    summaryText: string;
    advice: PostureAdviceItem[];
    provider: string;
    model: string | null;
    generatedAt: string;
}

function coerceAdviceJson(value: unknown): PostureAdviceItem[] {
    if (!Array.isArray(value)) return [];
    const out: PostureAdviceItem[] = [];
    for (const item of value) {
        if (item && typeof item === 'object') {
            const r = item as Record<string, unknown>;
            const title = typeof r.title === 'string' ? r.title : '';
            if (!title) continue;
            const priority: AdvicePriority =
                r.priority === 'high' || r.priority === 'low' ? r.priority : 'medium';
            out.push({ title, detail: typeof r.detail === 'string' ? r.detail : '', priority });
        }
    }
    return out;
}

/** Map a cached Prisma row to the serializable hero DTO (or null). */
export function toPostureDto(row: CompliancePostureSummary | null): PostureSummaryDto | null {
    if (!row) return null;
    const label = (POSTURE_LABELS as readonly string[]).includes(row.postureLabel)
        ? (row.postureLabel as PostureLabel)
        : 'DEVELOPING';
    return {
        postureLabel: label,
        maturityScore: row.maturityScore,
        summaryText: row.summaryText,
        advice: coerceAdviceJson(row.adviceJson),
        provider: row.provider,
        model: row.model,
        generatedAt: row.generatedAt.toISOString(),
    };
}

/**
 * Assemble the aggregate signals snapshot for a tenant.
 *
 * Reuses `getExecutiveDashboard` (control coverage, risk severities, evidence
 * freshness, task/policy/vendor/finding counts) and a single per-framework
 * coverage pass. Everything returned is a count/percent — no entity names,
 * free text, or PII.
 */
export async function gatherPostureSignals(ctx: RequestContext): Promise<PostureSummaryInput> {
    assertCanRead(ctx);

    const [exec, frameworks] = await Promise.all([
        getExecutiveDashboard(ctx),
        listFrameworks(ctx),
    ]);

    // Per-framework coverage — one tenant-scoped read of the control ⇄
    // requirement links, then grouped in memory (no per-framework query loop).
    const frameworkById = new Map(
        frameworks.map((f) => [f.id, { key: f.key, name: f.name, total: f._count.requirements }]),
    );

    const links = await runInTenantContext(ctx, (tdb) =>
        tdb.controlRequirementLink.findMany({
            where: { tenantId: ctx.tenantId },
            select: { requirementId: true, requirement: { select: { frameworkId: true } } },
            take: 50000,
        }),
    );

    // Distinct mapped requirements per framework.
    const mappedByFramework = new Map<string, Set<string>>();
    for (const link of links) {
        const fwId = link.requirement?.frameworkId;
        if (!fwId) continue;
        let set = mappedByFramework.get(fwId);
        if (!set) {
            set = new Set<string>();
            mappedByFramework.set(fwId, set);
        }
        set.add(link.requirementId);
    }

    const frameworkSignals: FrameworkCoverageSignal[] = [];
    for (const [fwId, mappedSet] of mappedByFramework) {
        const meta = frameworkById.get(fwId);
        if (!meta || meta.total === 0) continue;
        const mapped = mappedSet.size;
        frameworkSignals.push({
            key: meta.key,
            name: meta.name,
            mapped,
            total: meta.total,
            coveragePercent: Math.round((mapped / meta.total) * 100),
        });
    }
    // Weakest coverage first — the narrative + advice lead with the gaps.
    frameworkSignals.sort((a, b) => a.coveragePercent - b.coveragePercent);

    const sev = exec.riskBySeverity;
    return {
        controls: {
            applicable: exec.controlCoverage.applicable,
            implemented: exec.controlCoverage.implemented,
            inProgress: exec.controlCoverage.inProgress,
            notStarted: exec.controlCoverage.notStarted,
            coveragePercent: exec.controlCoverage.coveragePercent,
        },
        frameworks: frameworkSignals,
        risks: {
            total: sev.critical + sev.high + sev.medium + sev.low,
            critical: sev.critical,
            high: sev.high,
            medium: sev.medium,
            low: sev.low,
        },
        evidence: {
            overdue: exec.evidenceExpiry.overdue,
            dueSoon: exec.evidenceExpiry.dueSoon7d + exec.evidenceExpiry.dueSoon30d,
            current: exec.evidenceExpiry.current,
        },
        findings: { open: exec.stats.openFindings },
        tasks: { open: exec.taskSummary.open, overdue: exec.taskSummary.overdue },
        policies: {
            total: exec.policySummary.total,
            overdueReview: exec.policySummary.overdueReview,
        },
        vendors: { overdueReview: exec.vendorSummary.overdueReview },
        // Org-maturity is an ORG-scoped (not tenant-scoped) signal requiring an
        // OrgContext, so it isn't wired here — the stub derives the score from
        // coverage + hygiene instead. Left null on purpose.
        maturityAverage: null,
    };
}

/**
 * Generate (and cache) the compliance-posture summary for a tenant.
 *
 * gather signals → provider.generate → output-guard → upsert the single
 * per-tenant row. Returns the guarded result.
 */
export async function generateCompliancePostureSummary(
    ctx: RequestContext,
): Promise<PostureSummaryResult> {
    const signals = await gatherPostureSignals(ctx);

    const provider = getCompliancePostureProvider();
    const raw = await provider.generate(signals);
    const result = applyPostureOutputGuard(raw);

    logger.info('compliance-posture summary generated', {
        component: 'compliance-posture',
        tenantId: ctx.tenantId,
        provider: result.provider,
        model: result.model,
        isFallback: result.isFallback ?? false,
        postureLabel: result.postureLabel,
        maturityScore: result.maturityScore,
        payload: describePayload(signals),
    });

    await runInTenantContext(ctx, (tdb) =>
        tdb.compliancePostureSummary.upsert({
            where: { tenantId: ctx.tenantId },
            create: {
                tenantId: ctx.tenantId,
                postureLabel: result.postureLabel,
                maturityScore: result.maturityScore,
                summaryText: result.summaryText,
                adviceJson: result.advice as unknown as Prisma.InputJsonValue,
                signalsJson: signals as unknown as Prisma.InputJsonValue,
                provider: result.provider,
                model: result.model ?? null,
                generatedAt: new Date(),
            },
            update: {
                postureLabel: result.postureLabel,
                maturityScore: result.maturityScore,
                summaryText: result.summaryText,
                adviceJson: result.advice as unknown as Prisma.InputJsonValue,
                signalsJson: signals as unknown as Prisma.InputJsonValue,
                provider: result.provider,
                model: result.model ?? null,
                generatedAt: new Date(),
            },
        }),
    );

    return result;
}

/**
 * Read the cached compliance-posture summary for a tenant (or null when the
 * daily cron has not yet produced one).
 */
export async function getLatestPostureSummary(
    ctx: RequestContext,
): Promise<CompliancePostureSummary | null> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (tdb) =>
        tdb.compliancePostureSummary.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
}

/**
 * Build a tenant-scoped read RequestContext for the daily cron actor.
 *
 * Picks an active member (OWNER/ADMIN preferred) so RLS + the read policies
 * resolve against a real user. Returns null when the tenant has no active
 * members (nothing to summarise).
 */
export async function buildPostureCronContext(
    tenantId: string,
): Promise<RequestContext | null> {
    const member = await prisma.tenantMembership.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        // Role is a Postgres enum ordered by declaration
        // (OWNER, ADMIN, EDITOR, READER, AUDITOR), so `asc` surfaces an
        // OWNER/ADMIN first and falls back to any active member.
        orderBy: { role: 'asc' },
        select: { userId: true, role: true },
    });
    if (!member) return null;

    const appPermissions = getPermissionsForRole(member.role);
    return {
        requestId: `compliance-posture-${tenantId}`,
        userId: member.userId,
        tenantId,
        role: member.role,
        permissions: {
            canRead: appPermissions.controls.view,
            canWrite: appPermissions.controls.create,
            canAdmin: appPermissions.admin.manage,
            canAudit: appPermissions.audits.view,
            canExport: appPermissions.reports.export,
        },
        appPermissions,
    };
}
