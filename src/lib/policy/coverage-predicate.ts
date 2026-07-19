/**
 * The ONE definition of "a policy that counts" toward coverage / audit
 * readiness / governance scoring.
 *
 * Before this module three surfaces disagreed: the readiness-pack gate counted
 * APPROVED **or** PUBLISHED, the NIS2 scorer counted policies of ANY status via
 * a title-keyword match, and the coverage summary ignored policies entirely.
 * A DRAFT or IN_REVIEW policy is not an operative governance artefact — only a
 * PUBLISHED, non-deleted policy has been issued to the organisation.
 *
 * Every policy-counting scorer MUST route through this predicate (enforced by
 * `tests/guardrails/policy-coverage-predicate.test.ts`). Do not hand-roll a
 * `status: 'APPROVED'` / `status: 'PUBLISHED'` comparison in a scorer — call
 * `policyCountsWhere()` (DB) or `policyCountsTowardCoverage()` (in-memory).
 */
import type { Prisma } from '@prisma/client';

/** The single status a policy must hold to count. */
export const POLICY_COUNTS_STATUS = 'PUBLISHED' as const;

/**
 * In-memory predicate — does this policy count toward coverage / readiness?
 *
 * A policy counts iff it is PUBLISHED and not soft-deleted. DRAFT / IN_REVIEW /
 * APPROVED / ARCHIVED do NOT count.
 *
 * Acknowledgement refinement (2026-07-17): a policy still "counts" as ISSUED
 * the moment it is PUBLISHED, even before every assignee has acknowledged it —
 * this base predicate deliberately does NOT gate on acknowledgement. The
 * acknowledgement-completeness signal is instead SURFACED on the policy library
 * via `hasOutstandingAcknowledgement` below — an "Outstanding acks" KPI card, an
 * `acked/assigned` column, and an `outstanding=true` filter resolved server-side
 * in `PolicyRepository.outstandingAckVersionIds` (so it survives pagination).
 * Ack completion is therefore visible, not a leaf node. Auto-gating coverage /
 * readiness on unmet acknowledgement is a deliberate NON-change here: it would
 * materially move readiness scores and is a compliance-owner decision, not a
 * silent default. The helper is ready if that decision is taken.
 */
export function policyCountsTowardCoverage(p: {
    status: string;
    deletedAt?: Date | null;
}): boolean {
    return p.status === POLICY_COUNTS_STATUS && (p.deletedAt === null || p.deletedAt === undefined);
}

/**
 * Prisma `where` fragment for "policies that count", scoped to a tenant.
 * Compose into a larger `where` with a spread: `{ ...policyCountsWhere(t), category }`.
 */
export function policyCountsWhere(tenantId: string): Prisma.PolicyWhereInput {
    return { tenantId, status: POLICY_COUNTS_STATUS, deletedAt: null };
}

/**
 * The acknowledgement refinement, as a pure helper. A policy has an OUTSTANDING
 * (unmet mandatory) acknowledgement when at least one user was required to
 * acknowledge its current version and fewer have acknowledged than were
 * assigned. Zero assignments ⇒ no requirement ⇒ not outstanding. Stale acks
 * (of a superseded version) must already be excluded from `acknowledgedCount`
 * by the caller (see the roster), so they correctly read as outstanding here.
 */
export function hasOutstandingAcknowledgement(counts: {
    assignedCount: number;
    acknowledgedCount: number;
}): boolean {
    return counts.assignedCount > 0 && counts.acknowledgedCount < counts.assignedCount;
}
