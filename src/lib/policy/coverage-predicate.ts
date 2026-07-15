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
 * Where a control or framework additionally *requires attestation*, the caller
 * layers an acknowledgement-complete check on top of this base predicate — that
 * refinement is context-specific and is NOT baked in here (a policy still
 * "counts" as issued even before every assignee has acknowledged it).
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
