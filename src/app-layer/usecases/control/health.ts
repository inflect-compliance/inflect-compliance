/**
 * Control health synthesis (R2-P2).
 *
 * The control detail page was 8 self-fetching tabs the user had to assemble
 * into a judgement. This aggregates the "is this control implemented and
 * operating?" signals into ONE payload so the Overview can answer it without
 * tab-hopping: implementation status + applicability + latest manual-test
 * result + latest automated-check status + effectiveness (pass rate) + how
 * much posture the control carries (requirement/framework coverage).
 *
 * Read-only; a single `controls.view` gate. All queries are controlId-scoped.
 */
import { RequestContext } from '../../types';
import { assertCanReadControls } from '../../policies/control.policies';
import { runInTenantContext } from '@/lib/db-context';
import { notFound } from '@/lib/errors/types';
import { listExecutionsForControl } from '../integrations';
import { computeControlEffectivenessMap } from '../control-test';
import {
    computeControlHealthVerdict,
    type ControlHealthVerdict,
} from '@/lib/controls/control-health';

export interface ControlHealthDTO {
    /** Composite health gate over the measured signals (pass rate + freshness
     *  + exceptions + age). The single "is this control healthy?" answer. */
    verdict: ControlHealthVerdict;
    status: string;
    applicability: string;
    lastTested: string | null;
    latestTestResult: string | null; // PASS | FAIL | INCONCLUSIVE
    latestTestAt: string | null;
    latestCheckStatus: string | null; // PASSED | FAILED | ERROR | NOT_APPLICABLE
    latestCheckAt: string | null;
    /** Active accepted exceptions (an accepted gap) — a health degrader. */
    openExceptions: number;
    effectiveness: {
        passRate: number | null;
        total: number;
        passes: number;
        fails: number;
        inconclusive: number;
        windowDays: number;
    };
    coverage: {
        requirementCount: number;
        frameworkCount: number;
        frameworks: string[];
    };
}

const EFFECTIVENESS_WINDOW_DAYS = 90;
/** Evidence attached within this window counts as "fresh" for the health gate. */
const EVIDENCE_FRESH_DAYS = 365;

export async function getControlHealth(
    ctx: RequestContext,
    controlId: string,
): Promise<ControlHealthDTO> {
    assertCanReadControls(ctx);

    const now = new Date();

    const core = await runInTenantContext(ctx, async (db) => {
        const control = await db.control.findFirst({
            where: { id: controlId, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
            select: { id: true, status: true, applicability: true, lastTested: true, nextDueAt: true },
        });
        if (!control) return null;

        const [latestTest, effMap, links, openExceptions, latestEvidence] = await Promise.all([
            // Latest completed manual test run (result + when).
            db.controlTestRun.findFirst({
                where: { tenantId: ctx.tenantId, controlId, status: 'COMPLETED', result: { not: null } },
                orderBy: { executedAt: 'desc' },
                select: { result: true, executedAt: true },
            }),
            // Effectiveness pass-rate via THE canonical function (was a
            // reimplemented groupBy here).
            computeControlEffectivenessMap(db, ctx.tenantId, [controlId], EFFECTIVENESS_WINDOW_DAYS),
            // Coverage contribution — canonical controlRequirementLink + frameworks.
            db.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, controlId },
                select: { requirement: { select: { framework: { select: { name: true } } } } },
                take: 500, // a control maps to a bounded set of requirements
            }),
            // Active accepted exceptions — a health degrader.
            db.controlException.count({ where: { tenantId: ctx.tenantId, controlId, status: 'APPROVED' } }),
            // Freshness — the most-recently-attached evidence.
            db.controlEvidenceLink.findFirst({
                where: { tenantId: ctx.tenantId, controlId },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
            }),
        ]);

        return { control, latestTest, eff: effMap.get(controlId)!, links, openExceptions, latestEvidence };
    });

    if (!core) throw notFound('Control not found');
    const { control, latestTest, eff, links, openExceptions, latestEvidence } = core;

    const checks = await listExecutionsForControl(ctx, controlId, { limit: 1 });
    const latestCheck = checks[0] ?? null;

    const frameworks = [...new Set(links.map((l) => l.requirement.framework.name))];

    const overdue = !!control.nextDueAt && control.nextDueAt.getTime() < now.getTime();
    const evidenceFresh =
        !!latestEvidence &&
        latestEvidence.createdAt.getTime() >= now.getTime() - EVIDENCE_FRESH_DAYS * 24 * 60 * 60 * 1000;

    const verdict = computeControlHealthVerdict({
        applicability: control.applicability,
        status: control.status,
        passRate: eff.passRate,
        total: eff.total,
        overdue,
        openExceptions,
        evidenceFresh,
    });

    return {
        verdict,
        status: control.status,
        applicability: control.applicability,
        lastTested: control.lastTested ? control.lastTested.toISOString() : null,
        latestTestResult: latestTest?.result ?? null,
        latestTestAt: latestTest?.executedAt ? latestTest.executedAt.toISOString() : null,
        latestCheckStatus: latestCheck?.status ?? null,
        latestCheckAt: latestCheck?.executedAt ? new Date(latestCheck.executedAt).toISOString() : null,
        openExceptions,
        effectiveness: {
            passRate: eff.passRate,
            total: eff.total,
            passes: eff.passes,
            fails: eff.fails,
            inconclusive: eff.inconclusive,
            windowDays: EFFECTIVENESS_WINDOW_DAYS,
        },
        coverage: {
            requirementCount: links.length,
            frameworkCount: frameworks.length,
            frameworks,
        },
    };
}

export interface ControlHealthVerdictRow {
    controlId: string;
    verdict: ControlHealthVerdict;
    passRate: number | null;
}

export interface ControlHealthSummary {
    verdicts: ControlHealthVerdictRow[];
    counts: Record<ControlHealthVerdict, number>;
}

/**
 * Batched health verdict for EVERY (non-deleted) control — one groupBy for the
 * measured pass rate + one control read. Backs the control-list Health badge
 * and the controls-dashboard health summary. Uses the CHEAP signals (pass rate
 * + overdue + status/applicability); exceptions + evidence freshness are the
 * detail-only refinements, so the list verdict is a fast approximation of the
 * same gate (never a contradictory second notion).
 */
export async function getControlHealthVerdicts(ctx: RequestContext): Promise<ControlHealthSummary> {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, async (db) => {
        const controls = await db.control.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, status: true, applicability: true, nextDueAt: true },
            take: 5000,
        });
        const effMap = await computeControlEffectivenessMap(
            db,
            ctx.tenantId,
            controls.map((c) => c.id),
            EFFECTIVENESS_WINDOW_DAYS,
        );
        const now = Date.now();
        const counts: Record<ControlHealthVerdict, number> = {
            HEALTHY: 0, DEGRADED: 0, AT_RISK: 0, NOT_APPLICABLE: 0, UNKNOWN: 0,
        };
        const verdicts = controls.map((c) => {
            const eff = effMap.get(c.id);
            const verdict = computeControlHealthVerdict({
                applicability: c.applicability,
                status: c.status,
                passRate: eff?.passRate ?? null,
                total: eff?.total ?? 0,
                overdue: !!c.nextDueAt && c.nextDueAt.getTime() < now,
            });
            counts[verdict] += 1;
            return { controlId: c.id, verdict, passRate: eff?.passRate ?? null };
        });
        return { verdicts, counts };
    });
}
