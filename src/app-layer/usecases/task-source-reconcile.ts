/**
 * Task → source reconciliation (Tasks roadmap TP-3).
 *
 * Auto-created tasks are one-way today: a control-test failure, an
 * asset vulnerability, or an audit finding spawns a remediation Task,
 * but COMPLETING that task writes only the task's own row — the source
 * that raised it stays silently open. That is a compliance-correctness
 * bug: an auditor reading the control / vulnerability / finding sees a
 * gap that was, in fact, remediated.
 *
 * `reconcileTaskSource` closes the loop. It is called from
 * `setTaskStatus` + `bulkSetTaskStatus` AFTER the task's own status
 * write + audit, ONLY when the task reaches a terminal RESOLVED/CLOSED
 * state (NOT CANCELED — a cancelled task did not fix anything, so its
 * source must stay open).
 *
 * Every reconciler writes directly on the SAME tenant transaction
 * (`db` from the caller's `runInTenantContext`) so the source mutation
 * commits atomically with the task close, and audits its write via
 * `logEvent`. None of them re-enter `runInTenantContext` (that would
 * open a second, non-atomic transaction).
 */
import { RequestContext } from '../types';
import type { PrismaTx } from '@/lib/db-context';
import { logEvent } from '../events/audit';
import { logger } from '@/lib/observability/logger';
import { computeNextDueAt } from '../utils/cadence';

/** The statuses that trigger source reconciliation. CANCELED is
 *  deliberately excluded — cancelling a task did not remediate. */
const RECONCILE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

type TaskMetadata = { testPlanId?: string; testRunId?: string; findingId?: string } | null;

/**
 * Dispatch a terminal task close to its per-source reconciler. Safe to
 * call for any task/status — it no-ops unless the status is terminal
 * (RESOLVED/CLOSED) and the task actually points at a reconcilable
 * source. Never throws for a missing/foreign source: the task close is
 * already committed, so reconciliation is best-effort and logged.
 */
export async function reconcileTaskSource(
    db: PrismaTx,
    ctx: RequestContext,
    taskId: string,
    status: string,
): Promise<void> {
    if (!RECONCILE_STATUSES.has(status)) return;

    // Load only the reconciliation-relevant fields. RLS + the explicit
    // tenantId filter keep this scoped to the caller's tenant.
    const task = await db.task.findFirst({
        where: { id: taskId, tenantId: ctx.tenantId },
        select: {
            id: true,
            type: true,
            controlId: true,
            findingId: true,
            metadataJson: true,
        },
    });
    if (!task) return;
    const metadata = (task.metadataJson ?? null) as TaskMetadata;

    // Reconciler 2 — vulnerability. Keyed on `remediationTaskId`, NOT
    // on task.type (vuln remediation tasks are plain type='TASK'), so
    // this lookup runs for every terminal task.
    await reconcileVulnerability(db, ctx, taskId);

    // Reconciler 1 — CONTROL_GAP → reflect a re-check on the control.
    if (task.type === 'CONTROL_GAP' && task.controlId) {
        await reconcileControlGap(db, ctx, taskId, task.controlId, metadata);
    }

    // Reconciler 3 — close the linked Finding. Keyed on the FK (with a
    // metadataJson fallback for legacy rows) rather than task.type, so
    // BOTH audit AUDIT_FINDING tasks AND NIS2 CONTROL_GAP tasks (which
    // also carry a findingId) close their finding on terminal close.
    const findingId = task.findingId ?? metadata?.findingId ?? null;
    if (findingId) await reconcileFinding(db, ctx, taskId, findingId);
}

// ─── Reconciler 1 — CONTROL_GAP → control re-check ──────────────────
//
// Closing a control-gap task must not leave the control silently
// "failed forever". Controls carry NO stored verdict — effectiveness
// is computed live from ControlTestRun rows + Control.lastTested. We
// REFLECT the gap closure observably WITHOUT fabricating a PASS
// (closing a task ≠ the control passing):
//
//   • Always stamp the control as re-attested — advance
//     `lastTested = now` + roll `nextDueAt` — so the freshness the
//     health summary / readiness scoring reads moves forward. This
//     mirrors the sanctioned `attestControlTested` helper.
//   • If the originating test plan is automated (has an
//     integration/automation binding), ALSO queue a fresh PLANNED
//     ControlTestRun so the real automated check re-executes and
//     records its own genuine result — a real re-run, not a
//     synthesised verdict.

async function reconcileControlGap(
    db: PrismaTx,
    ctx: RequestContext,
    taskId: string,
    controlId: string,
    metadata: TaskMetadata,
): Promise<void> {
    const control = await db.control.findFirst({
        where: { id: controlId, tenantId: ctx.tenantId },
        select: { id: true, frequency: true, applicability: true },
    });
    // NOT_APPLICABLE controls (or a foreign/missing control) get no
    // re-attestation — nothing to reflect.
    if (!control || control.applicability === 'NOT_APPLICABLE') return;

    // Is the originating plan automated? Look it up from the task's
    // metadata pointer. Absent plan / manual plan → attestation only.
    let automated = false;
    let planId: string | null = null;
    if (metadata?.testPlanId) {
        const plan = await db.controlTestPlan.findFirst({
            where: { id: metadata.testPlanId, tenantId: ctx.tenantId },
            select: { id: true, method: true, automationType: true },
        });
        if (plan) {
            planId = plan.id;
            automated = plan.automationType !== 'MANUAL' || plan.method === 'AUTOMATED';
        }
    }

    const now = new Date();
    await db.control.update({
        where: { id: control.id },
        data: { lastTested: now, nextDueAt: computeNextDueAt(control.frequency, now) },
    });

    let requeuedRunId: string | null = null;
    if (automated && planId) {
        const run = await db.controlTestRun.create({
            data: {
                tenantId: ctx.tenantId,
                controlId: control.id,
                testPlanId: planId,
                status: 'PLANNED',
                createdByUserId: ctx.userId,
                requestId: ctx.requestId,
            },
            select: { id: true },
        });
        requeuedRunId = run.id;
    }

    await logEvent(db, ctx, {
        action: 'CONTROL_GAP_TASK_RECONCILED',
        entityType: 'Control',
        entityId: control.id,
        details: requeuedRunId
            ? `Control re-check queued (automated) on gap-task close`
            : `Control re-test attestation recorded on gap-task close`,
        detailsJson: {
            category: 'custom',
            event: 'control_gap_task_reconciled',
            automated,
        },
        metadata: { taskId, controlId: control.id, requeuedRunId, testPlanId: planId },
    });

    logger.info('task-source-reconcile: control gap reflected', {
        taskId,
        controlId: control.id,
        automated,
        requeuedRunId,
    });
}

// ─── Reconciler 2 — vulnerability → advance the AssetVulnerability ──

async function reconcileVulnerability(
    db: PrismaTx,
    ctx: RequestContext,
    taskId: string,
): Promise<void> {
    const vuln = await db.assetVulnerability.findFirst({
        where: { remediationTaskId: taskId, tenantId: ctx.tenantId },
        select: { id: true, status: true },
    });
    if (!vuln) return;
    // Only advance from an active state — never regress ACCEPTED /
    // FALSE_POSITIVE / already-MITIGATED.
    if (vuln.status !== 'OPEN' && vuln.status !== 'MITIGATING') return;

    const updated = await db.assetVulnerability.update({
        where: { id: vuln.id },
        data: { status: 'MITIGATED' },
    });

    await logEvent(db, ctx, {
        action: 'ASSET_VULNERABILITY_UPDATED',
        entityType: 'AssetVulnerability',
        entityId: vuln.id,
        details: `Vulnerability status ${vuln.status} → ${updated.status} on remediation-task close`,
        detailsJson: {
            category: 'status_change',
            entityName: 'AssetVulnerability',
            fromStatus: vuln.status,
            toStatus: updated.status,
        },
        metadata: { taskId, from: vuln.status, to: updated.status },
    });

    logger.info('task-source-reconcile: vulnerability mitigated', {
        taskId,
        vulnerabilityId: vuln.id,
    });
}

// ─── Reconciler 3 — AUDIT_FINDING → close the Finding ───────────────

async function reconcileFinding(
    db: PrismaTx,
    ctx: RequestContext,
    taskId: string,
    findingId: string,
): Promise<void> {
    const finding = await db.finding.findFirst({
        where: { id: findingId, tenantId: ctx.tenantId },
        select: { id: true, status: true },
    });
    if (!finding || finding.status === 'CLOSED') return;

    const now = new Date();
    await db.finding.update({
        where: { id: finding.id },
        data: {
            status: 'CLOSED',
            verifiedBy: ctx.userId,
            verifiedAt: now,
        },
    });

    await logEvent(db, ctx, {
        action: 'STATUS_CHANGE',
        entityType: 'Finding',
        entityId: finding.id,
        details: `${finding.status} → CLOSED on remediation-task close`,
        detailsJson: {
            category: 'status_change',
            entityName: 'Finding',
            fromStatus: finding.status,
            toStatus: 'CLOSED',
        },
        metadata: { taskId, from: finding.status, to: 'CLOSED' },
    });

    logger.info('task-source-reconcile: finding closed', {
        taskId,
        findingId: finding.id,
    });
}
