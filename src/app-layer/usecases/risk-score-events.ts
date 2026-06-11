/**
 * RQ2-1 — per-mutation risk-score provenance.
 *
 * `recordScoreEvent` is the single write seam for the
 * `RiskScoreEvent` ledger. It is deliberately a plain function over
 * an in-flight `PrismaTx` — callers invoke it INSIDE the same
 * `runInTenantContext` transaction that performs the score write, so
 * the ledger can never drift from the row state (a rollback takes
 * both; a commit takes both).
 *
 * Boundary vs RQ-9 (`risk-snapshot.ts`): snapshots are cadence
 * records for trend charts (one per risk per day, cron-written);
 * events are mutation records for explainability + audit narrative
 * (exactly one per score-changing write, with source provenance).
 *
 * Sources:
 *   USER      — human entered/edited the values directly.
 *   DERIVED   — system-computed value accepted as-is (RQ2-2).
 *   PLAN      — treatment-plan completion wrote the residual.
 *   AI        — accepted from an AI suggestion.
 *   MIGRATION — backfilled from pre-provenance data (migration SQL
 *               only — application code never writes this source).
 */
import type { RiskScoreEventKind, RiskScoreEventSource } from '@prisma/client';
import type { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';

export interface RecordScoreEventInput {
    riskId: string;
    kind: RiskScoreEventKind;
    likelihood: number;
    impact: number;
    score: number;
    source: Exclude<RiskScoreEventSource, 'MIGRATION'>;
    justification?: string | null;
    /** Nullable for PLAN-driven writes with no acting user. */
    createdByUserId?: string | null;
}

/**
 * Append one ledger row. MUST be called inside the same transaction
 * as the score write it records — pass the live `db` handle from the
 * surrounding `runInTenantContext`, never a fresh client.
 */
export async function recordScoreEvent(
    db: PrismaTx,
    tenantId: string,
    input: RecordScoreEventInput,
) {
    return db.riskScoreEvent.create({
        data: {
            tenantId,
            riskId: input.riskId,
            kind: input.kind,
            likelihood: input.likelihood,
            impact: input.impact,
            score: input.score,
            source: input.source,
            // Epic D.2 — justification is user-supplied free text on
            // an encrypted column; sanitise at the single write seam
            // so every caller (USER edit, DERIVED accept, PLAN
            // completion, AI) is covered before persistence.
            justification:
                input.justification != null && input.justification !== ''
                    ? sanitizePlainText(input.justification)
                    : null,
            createdByUserId: input.createdByUserId ?? null,
        },
    });
}

/**
 * Read path — the provenance trail for one risk, newest first.
 * Bounded: the explainer/history UI shows the recent narrative, not
 * an infinite scroll (the full ledger remains queryable by id).
 */
export async function listScoreEvents(
    ctx: RequestContext,
    riskId: string,
    options: { take?: number } = {},
) {
    assertCanRead(ctx);
    const take = Math.min(Math.max(options.take ?? 50, 1), 200);
    return runInTenantContext(ctx, async (db) => {
        const events = await db.riskScoreEvent.findMany({
            where: { tenantId: ctx.tenantId, riskId },
            orderBy: { createdAt: 'desc' },
            take,
        });
        // Batch-attach actor names (no @relation on createdByUserId —
        // PLAN/MIGRATION rows have none; mirrors risk.ts's
        // attachOwnerUsers pattern, one query per page).
        const ids = [...new Set(events.map((e) => e.createdByUserId).filter((v): v is string => Boolean(v)))];
        if (ids.length === 0) return events.map((e) => ({ ...e, actor: null }));
        const users = await db.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
        });
        const byId = new Map(users.map((u) => [u.id, u]));
        return events.map((e) => ({
            ...e,
            actor: e.createdByUserId ? (byId.get(e.createdByUserId) ?? null) : null,
        }));
    });
}
