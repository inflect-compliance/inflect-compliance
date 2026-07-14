/**
 * The single definition of "evidence that counts toward framework
 * coverage / audit readiness".
 *
 * Historically four scorer sites disagreed: some counted any
 * non-archived row, one counted `SUBMITTED` + `APPROVED`, none looked
 * at expiry. That let a DRAFT / SUBMITTED / expired piece of evidence
 * silently satisfy a control's coverage gate — approval was not
 * load-bearing. This module is the ONE predicate every site routes
 * through so the rule can never drift again.
 *
 * The rule: qualifying evidence is APPROVED, not archived, not
 * soft-deleted, and (if it carries an expiry timestamp) not yet expired.
 *
 * NOTE on column naming (both real, both surprising):
 *   - the archive flag is `isArchived` (boolean), NOT `archivedAt`;
 *   - the expiry timestamp is `expiredAt` (set when the row expires),
 *     NOT `expiresAt`;
 *   - soft-delete is `deletedAt`.
 */
export interface CoverageEvidenceShape {
    status: string;
    expiredAt?: Date | string | null;
    isArchived?: boolean | null;
    deletedAt?: Date | string | null;
}

/**
 * In-memory predicate — use when evidence rows are already loaded and
 * you need to decide, per row, whether it counts. Mirrors
 * `coverageQualifyingEvidenceWhere` exactly.
 */
export function isCoverageQualifyingEvidence(
    e: CoverageEvidenceShape,
    now: Date = new Date(),
): boolean {
    if (e.status !== 'APPROVED') return false;
    if (e.isArchived) return false;
    if (e.deletedAt) return false;
    if (e.expiredAt != null && new Date(e.expiredAt) <= now) return false;
    return true;
}

/**
 * Prisma `where` fragment for the SAME rule — use for DB-level
 * filtering so unqualifying rows never leave the database. Spread it
 * into an Evidence `where` alongside `tenantId` / `controlId` scoping.
 */
export function coverageQualifyingEvidenceWhere(now: Date = new Date()) {
    return {
        status: 'APPROVED' as const,
        isArchived: false,
        deletedAt: null,
        OR: [{ expiredAt: null }, { expiredAt: { gt: now } }],
    };
}
