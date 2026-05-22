/**
 * Audit Readiness Scoring & Exports
 *
 * Framework-aware readiness scoring with documented weights:
 *
 * ISO27001:2022 weights:
 *   - Coverage (requirements mapped to APPLIES controls): 35%
 *   - Implementation (APPLIES controls IMPLEMENTED): 25%
 *   - Evidence (APPLIES controls with >=1 evidence): 25%
 *   - Task completion (penalty for overdue tasks): 10%
 *   - Issues (penalty for open CONTROL_GAP/AUDIT_FINDING): 5%
 *
 * NIS2 Directive weights:
 *   - Coverage (NIS2 requirements mapped to controls): 40%
 *   - Evidence (mapped controls with >=1 evidence): 30%
 *   - Policies (presence of key NIS2 policies: IR/BCP/Supplier): 15%
 *   - Issues (penalty for open incidents/issues): 15%
 *
 * RETENTION HARDENING: Evidence queries exclude archived (isArchived=true)
 * and soft-deleted (deletedAt!=null) evidence. This ensures readiness
 * scores only reflect active, valid evidence.
 */
import { type AuditCycle } from '@prisma/client';
import { RequestContext } from '../types';
import { assertCanViewPack } from '../policies/audit-readiness.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { TERMINAL_WORK_ITEM_STATUSES } from '../domain/work-item-status';


// ─── Types ───

export interface ReadinessBreakdown {
    coverage: { score: number; weight: number; mapped: number; total: number };
    implementation?: { score: number; weight: number; implemented: number; total: number };
    evidence: { score: number; weight: number; withEvidence: number; total: number };
    policies?: { score: number; weight: number; found: string[]; expected: string[] };
    tasks?: { score: number; weight: number; overdue: number };
    issues: { score: number; weight: number; open: number };
}

export interface ReadinessGap {
    type: 'UNMAPPED_REQUIREMENT' | 'MISSING_EVIDENCE' | 'OVERDUE_TASK' | 'OPEN_ISSUE' | 'MISSING_POLICY';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    details: string;
    entityId?: string;
}

export interface ReadinessResult {
    frameworkKey: string;
    score: number;
    breakdown: ReadinessBreakdown;
    gaps: ReadinessGap[];
    recommendations: string[];
    computedAt: string;
}

// ─── ISO27001 Weights ───
const ISO_WEIGHTS = { coverage: 0.35, implementation: 0.25, evidence: 0.25, tasks: 0.10, issues: 0.05 };

// ─── NIS2 Weights ───
const NIS2_WEIGHTS = { coverage: 0.40, evidence: 0.30, policies: 0.15, issues: 0.15 };

// ─── NIS2 Key Policies ───
const NIS2_KEY_POLICIES = [
    { keyword: 'incident', label: 'Incident Response' },
    { keyword: 'business continuity', label: 'Business Continuity' },
    { keyword: 'disaster recovery', label: 'Disaster Recovery' },
    { keyword: 'supplier', label: 'Supplier Security' },
    { keyword: 'supply chain', label: 'Supply Chain Security' },
    { keyword: 'access control', label: 'Access Control' },
];

// ─── Compute Readiness ───

export async function computeReadiness(ctx: RequestContext, cycleId: string): Promise<ReadinessResult> {
    assertCanViewPack(ctx);

    const cycle = await runInTenantContext(ctx, (tdb) =>
        tdb.auditCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } }));
    if (!cycle) throw notFound('Audit cycle not found');

    let result: ReadinessResult;
    if (cycle.frameworkKey === 'ISO27001') {
        result = await computeISO27001Readiness(ctx, cycle);
    } else if (cycle.frameworkKey === 'NIS2') {
        result = await computeNIS2Readiness(ctx, cycle);
    } else {
        throw notFound(`No readiness model for framework: ${cycle.frameworkKey}`);
    }

    // Log event
    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'READINESS_COMPUTED',
            entityType: 'AuditCycle',
            entityId: cycleId,
            details: JSON.stringify({ score: result.score, frameworkKey: cycle.frameworkKey }),
            detailsJson: {
                category: 'custom',
                event: 'readiness_computed',
                score: result.score,
                frameworkKey: cycle.frameworkKey,
                gapCount: result.gaps.length,
            },
        })
    );

    return result;
}

// ─── ISO27001 Scoring ───

async function computeISO27001Readiness(ctx: RequestContext, cycle: AuditCycle): Promise<ReadinessResult> {
    const gaps: ReadinessGap[] = [];

    // 1) Requirement coverage
    const fw = await runInTenantContext(ctx, (tdb) => tdb.framework.findFirst({ where: { key: 'ISO27001' } }));
    let totalReqs = 0;
    let mappedReqs = 0;
    interface RequirementSummary { id: string; code: string; title: string }
    let unmappedReqs: RequirementSummary[] = [];

    if (fw) {
        const reqs = await runInTenantContext(ctx, (tdb) => tdb.frameworkRequirement.findMany({
            where: { frameworkId: fw.id, deprecatedAt: null },
            select: { id: true, code: true, title: true },
        }));
        totalReqs = reqs.length;

        const mappedReqIds = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirement: { frameworkId: fw.id } },
                select: { requirementId: true },
            }));
        const mappedSet = new Set(mappedReqIds.map((l) => l.requirementId));
        mappedReqs = mappedSet.size;
        unmappedReqs = reqs.filter((r) => !mappedSet.has(r.id));
    }

    const coverageScore = totalReqs > 0 ? (mappedReqs / totalReqs) * 100 : 0;

    // Add unmapped requirement gaps (top 10)
    unmappedReqs.slice(0, 10).forEach((r) => gaps.push({
        type: 'UNMAPPED_REQUIREMENT', severity: 'HIGH',
        title: `${r.code}: ${r.title}`, details: 'Not mapped to any control', entityId: r.id,
    }));

    // 2) Controls implementation
    const controls = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, applicability: 'APPLICABLE' },
            select: { id: true, code: true, name: true, status: true },
        }));
    const totalControls = controls.length;
    const implementedControls = controls.filter((c) => c.status === 'IMPLEMENTED').length;
    const implScore = totalControls > 0 ? (implementedControls / totalControls) * 100 : 0;

    // 3) Evidence completeness — EXCLUDES archived/deleted evidence
    const controlsWithEvidence = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, applicability: 'APPLICABLE' },
            select: { id: true, code: true, name: true, evidence: {
                where: { isArchived: false, deletedAt: null },
                select: { id: true },
            } },
        }));
    const withEvidence = controlsWithEvidence.filter((c) => c.evidence?.length > 0).length;
    const evidenceScore = totalControls > 0 ? (withEvidence / totalControls) * 100 : 0;

    // Controls missing evidence (top 10)
    controlsWithEvidence
        .filter((c) => !c.evidence?.length)
        .slice(0, 10)
        .forEach((c) => gaps.push({
            type: 'MISSING_EVIDENCE', severity: 'MEDIUM',
            title: `${c.code}: ${c.name}`, details: 'No active evidence attached (archived/expired excluded)', entityId: c.id,
        }));

    // 4) Overdue tasks
    const overdueTasks = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
                dueAt: { lt: new Date() },
            },
            select: { id: true, title: true, dueAt: true },
            take: 20,
        }));
    const overdueCount = overdueTasks.length;
    const taskScore = Math.max(0, 100 - (overdueCount * 10));

    overdueTasks.slice(0, 5).forEach((t) => gaps.push({
        type: 'OVERDUE_TASK', severity: 'MEDIUM',
        title: t.title, details: `Due: ${t.dueAt?.toISOString().split('T')[0] || 'unknown'}`, entityId: t.id,
    }));

    // 5) Open issues
    const openIssues = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
                type: { in: ['CONTROL_GAP', 'AUDIT_FINDING'] },
            },
            select: { id: true, title: true, severity: true },
            take: 20,
        }));
    const issueCount = openIssues.length;
    const issueScore = Math.max(0, 100 - (issueCount * 15));

    openIssues.slice(0, 5).forEach((i) => gaps.push({
        type: 'OPEN_ISSUE', severity: i.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        title: i.title, details: `Severity: ${i.severity}`, entityId: i.id,
    }));

    // Weighted score
    const score = Math.round(
        coverageScore * ISO_WEIGHTS.coverage +
        implScore * ISO_WEIGHTS.implementation +
        evidenceScore * ISO_WEIGHTS.evidence +
        taskScore * ISO_WEIGHTS.tasks +
        issueScore * ISO_WEIGHTS.issues
    );

    return {
        frameworkKey: 'ISO27001',
        score: Math.min(100, Math.max(0, score)),
        breakdown: {
            coverage: { score: Math.round(coverageScore), weight: ISO_WEIGHTS.coverage, mapped: mappedReqs, total: totalReqs },
            implementation: { score: Math.round(implScore), weight: ISO_WEIGHTS.implementation, implemented: implementedControls, total: totalControls },
            evidence: { score: Math.round(evidenceScore), weight: ISO_WEIGHTS.evidence, withEvidence, total: totalControls },
            tasks: { score: Math.round(taskScore), weight: ISO_WEIGHTS.tasks, overdue: overdueCount },
            issues: { score: Math.round(issueScore), weight: ISO_WEIGHTS.issues, open: issueCount },
        },
        gaps,
        recommendations: generateISO27001Recommendations(coverageScore, implScore, evidenceScore, overdueCount, issueCount),
        computedAt: new Date().toISOString(),
    };
}

// ─── NIS2 Scoring ───

async function computeNIS2Readiness(ctx: RequestContext, cycle: AuditCycle): Promise<ReadinessResult> {
    const gaps: ReadinessGap[] = [];

    // 1) Requirement coverage
    const fw = await runInTenantContext(ctx, (tdb) => tdb.framework.findFirst({ where: { key: 'NIS2' } }));
    let totalReqs = 0;
    let mappedReqs = 0;
    interface RequirementSummary { id: string; code: string; title: string }
    let unmappedReqs: RequirementSummary[] = [];

    if (fw) {
        const reqs = await runInTenantContext(ctx, (tdb) => tdb.frameworkRequirement.findMany({
            where: { frameworkId: fw.id, deprecatedAt: null },
            select: { id: true, code: true, title: true },
        }));
        totalReqs = reqs.length;

        const mappedReqIds = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirement: { frameworkId: fw.id } },
                select: { requirementId: true },
            }));
        const mappedSet = new Set(mappedReqIds.map((l) => l.requirementId));
        mappedReqs = mappedSet.size;
        unmappedReqs = reqs.filter((r) => !mappedSet.has(r.id));
    }

    const coverageScore = totalReqs > 0 ? (mappedReqs / totalReqs) * 100 : 0;

    unmappedReqs.slice(0, 10).forEach((r) => gaps.push({
        type: 'UNMAPPED_REQUIREMENT', severity: 'HIGH',
        title: `${r.code}: ${r.title}`, details: 'Not mapped to any measure', entityId: r.id,
    }));

    // 2) Evidence completeness for mapped controls — EXCLUDES archived/deleted evidence
    let controlIds: string[] = [];
    if (fw) {
        const links = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirement: { frameworkId: fw.id } },
                select: { controlId: true },
            }));
        controlIds = [...new Set(links.map((l) => l.controlId))];
    }
    if (controlIds.length === 0) {
        const allControls = await runInTenantContext(ctx, (tdb) =>
            tdb.control.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true } }));
        controlIds = allControls.map((c) => c.id);
    }

    const controlsWithEv = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, id: { in: controlIds } },
            select: { id: true, code: true, name: true, evidence: {
                where: { isArchived: false, deletedAt: null },
                select: { id: true },
            } },
        }));
    const totalControls = controlsWithEv.length;
    const withEvidence = controlsWithEv.filter((c) => c.evidence?.length > 0).length;
    const evidenceScore = totalControls > 0 ? (withEvidence / totalControls) * 100 : 0;

    controlsWithEv
        .filter((c) => !c.evidence?.length)
        .slice(0, 10)
        .forEach((c) => gaps.push({
            type: 'MISSING_EVIDENCE', severity: 'MEDIUM',
            title: `${c.code}: ${c.name}`, details: 'No active evidence for this control (archived/expired excluded)', entityId: c.id,
        }));

    // 3) Key policies check
    const policies = await runInTenantContext(ctx, (tdb) =>
        tdb.policy.findMany({
            where: { tenantId: ctx.tenantId },
            select: { id: true, title: true, category: true },
        }));

    const foundPolicies: string[] = [];
    const expectedPolicies = NIS2_KEY_POLICIES.map((p) => p.label);

    for (const kp of NIS2_KEY_POLICIES) {
        const found = policies.some((p) => {
            const text = `${p.title} ${p.category || ''}`.toLowerCase();
            return text.includes(kp.keyword);
        });
        if (found) foundPolicies.push(kp.label);
        else gaps.push({
            type: 'MISSING_POLICY', severity: 'MEDIUM',
            title: kp.label, details: `No policy found matching "${kp.keyword}"`,
        });
    }

    const policyScore = expectedPolicies.length > 0 ? (foundPolicies.length / expectedPolicies.length) * 100 : 0;

    // 4) Open issues
    const openIssues = await runInTenantContext(ctx, (tdb) =>
        tdb.task.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
            },
            select: { id: true, title: true, severity: true, type: true },
            take: 20,
        }));
    const issueCount = openIssues.length;
    const issueScore = Math.max(0, 100 - (issueCount * 10));

    openIssues.slice(0, 5).forEach((i) => gaps.push({
        type: 'OPEN_ISSUE', severity: i.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        title: i.title, details: `${i.type} · Severity: ${i.severity}`, entityId: i.id,
    }));

    const score = Math.round(
        coverageScore * NIS2_WEIGHTS.coverage +
        evidenceScore * NIS2_WEIGHTS.evidence +
        policyScore * NIS2_WEIGHTS.policies +
        issueScore * NIS2_WEIGHTS.issues
    );

    return {
        frameworkKey: 'NIS2',
        score: Math.min(100, Math.max(0, score)),
        breakdown: {
            coverage: { score: Math.round(coverageScore), weight: NIS2_WEIGHTS.coverage, mapped: mappedReqs, total: totalReqs },
            evidence: { score: Math.round(evidenceScore), weight: NIS2_WEIGHTS.evidence, withEvidence, total: totalControls },
            policies: { score: Math.round(policyScore), weight: NIS2_WEIGHTS.policies, found: foundPolicies, expected: expectedPolicies },
            issues: { score: Math.round(issueScore), weight: NIS2_WEIGHTS.issues, open: issueCount },
        },
        gaps,
        recommendations: generateNIS2Recommendations(coverageScore, evidenceScore, policyScore, issueCount),
        computedAt: new Date().toISOString(),
    };
}

// ─── Recommendations ───

function generateISO27001Recommendations(coverage: number, impl: number, evidence: number, overdue: number, issues: number): string[] {
    const recs: string[] = [];
    if (coverage < 50) recs.push('Map more Annex A requirements to controls — coverage is below 50%');
    else if (coverage < 80) recs.push('Continue mapping requirements — aim for 80%+ coverage before audit');
    if (impl < 60) recs.push('Focus on implementing controls — many APPLICABLE controls are not yet IMPLEMENTED');
    if (evidence < 50) recs.push('Attach evidence to controls — auditors will expect documentation for each control');
    else if (evidence < 80) recs.push('Strengthen evidence collection — aim for 80%+ controls with evidence');
    if (overdue > 5) recs.push(`Address ${overdue} overdue tasks to improve audit readiness`);
    else if (overdue > 0) recs.push(`Close remaining ${overdue} overdue task(s)`);
    if (issues > 3) recs.push(`Resolve ${issues} open audit findings/control gaps before audit`);
    if (recs.length === 0) recs.push('Readiness is strong — review final pack before scheduling audit');
    return recs;
}

function generateNIS2Recommendations(coverage: number, evidence: number, policies: number, issues: number): string[] {
    const recs: string[] = [];
    if (coverage < 50) recs.push('Map NIS2 requirements (Art.21 measures) to controls — coverage below 50%');
    else if (coverage < 80) recs.push('Continue mapping NIS2 requirements — aim for full Art.21 coverage');
    if (evidence < 50) recs.push('Attach evidence to mapped controls — NIS2 requires demonstrable measures');
    if (policies < 50) recs.push('Create key NIS2 policies: Incident Response, Business Continuity, Supplier Security');
    else if (policies < 100) recs.push('Complete missing NIS2 policy areas to demonstrate full compliance');
    if (issues > 3) recs.push(`Address ${issues} open issues to reduce compliance risk`);
    if (recs.length === 0) recs.push('NIS2 readiness is strong — prepare for notification to competent authority');
    return recs;
}

// ─── Export Generators ───

export async function exportReadinessJson(ctx: RequestContext, cycleId: string): Promise<ReadinessResult> {
    const result = await computeReadiness(ctx, cycleId);
    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'AUDIT_EXPORT_GENERATED',
            entityType: 'AuditCycle',
            entityId: cycleId,
            details: JSON.stringify({ format: 'readiness.json', score: result.score }),
            detailsJson: {
                category: 'custom',
                event: 'audit_export_generated',
                format: 'readiness.json',
                score: result.score,
            },
        })
    );
    return result;
}

export async function exportUnmappedCsv(ctx: RequestContext, cycleId: string): Promise<{ csv: string; filename: string }> {
    const result = await computeReadiness(ctx, cycleId);
    const unmapped = result.gaps.filter((g) => g.type === 'UNMAPPED_REQUIREMENT');

    const rows = [['Requirement', 'Details', 'Severity']];
    unmapped.forEach((g) => rows.push([g.title, g.details, g.severity]));

    const csv = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');

    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'AUDIT_EXPORT_GENERATED',
            entityType: 'AuditCycle',
            entityId: cycleId,
            details: JSON.stringify({ format: 'unmapped.csv', count: unmapped.length }),
            detailsJson: {
                category: 'custom',
                event: 'audit_export_generated',
                format: 'unmapped.csv',
                count: unmapped.length,
            },
        })
    );

    return { csv, filename: `${result.frameworkKey}-unmapped-requirements.csv` };
}

export async function exportControlGapsCsv(ctx: RequestContext, cycleId: string): Promise<{ csv: string; filename: string }> {
    const result = await computeReadiness(ctx, cycleId);
    const gapItems = result.gaps.filter((g) => g.type === 'MISSING_EVIDENCE' || g.type === 'OVERDUE_TASK' || g.type === 'OPEN_ISSUE');

    const rows = [['Type', 'Title', 'Details', 'Severity']];
    gapItems.forEach((g) => rows.push([g.type, g.title, g.details, g.severity]));

    const csv = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');

    await runInTenantContext(ctx, (tdb) =>
        logEvent(tdb, ctx, {
            action: 'AUDIT_EXPORT_GENERATED',
            entityType: 'AuditCycle',
            entityId: cycleId,
            details: JSON.stringify({ format: 'control-gaps.csv', count: gapItems.length }),
            detailsJson: {
                category: 'custom',
                event: 'audit_export_generated',
                format: 'control-gaps.csv',
                count: gapItems.length,
            },
        })
    );

    return { csv, filename: `${result.frameworkKey}-control-gaps.csv` };
}

// ─── Attach readiness to frozen pack ───

export async function addReadinessToPack(ctx: RequestContext, packId: string, cycleId: string) {
    assertCanViewPack(ctx);
    const result = await computeReadiness(ctx, cycleId);
    const { addAuditPackItems } = await import('./audit-readiness');
    return addAuditPackItems(ctx, packId, [{
        entityType: 'READINESS_REPORT',
        entityId: cycleId,
        snapshotJson: JSON.stringify(result),
        sortOrder: 999,
    }]);
}

// ─── Exported weights for tests ───
export { ISO_WEIGHTS, NIS2_WEIGHTS, NIS2_KEY_POLICIES };
