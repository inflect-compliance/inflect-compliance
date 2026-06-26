/**
 * DSAR erasure cascade (GDPR Art. 17 right-to-erasure).
 *
 * ⚠️ STAGE 1 FOUNDATION — execution is NOT enabled. This file documents
 * the intended cascade + carries the cooling-off guard; it is NOT
 * registered in register-schedules / executor-registry, so it never runs.
 * The irreversible execution lands in the Stage 3 PR (see docs/dsar.md),
 * which additionally requires:
 *   - a change to the IMMUTABLE_AUDIT_LOG DB trigger to PERMIT the
 *     pseudonymization UPDATE (NULL userId) while still refusing all other
 *     AuditLog UPDATEs, and
 *   - a full FK-cascade validated in staging against a real database.
 *
 * @module app-layer/jobs/dsar-erasure
 */
import { DSAR_COOLING_OFF_HOURS } from '@/lib/dsar';

/** Hours that must elapse after VERIFIED before erasure may fire. */
export const COOLING_OFF_HOURS = DSAR_COOLING_OFF_HOURS;

/**
 * The 24h cooling-off guard: erasure may only proceed once this window
 * has elapsed since the request reached VERIFIED, giving the user time to
 * cancel an irreversible deletion. Pure + unit-testable.
 */
export function coolingOffElapsed(verifiedAt: Date, now: Date = new Date()): boolean {
    return now.getTime() - verifiedAt.getTime() >= COOLING_OFF_HOURS * 3_600_000;
}

/**
 * Erase a user. NOT enabled in Stage 1 — throws. The body documents the
 * cascade so the Stage 3 implementation has a fixed contract.
 *
 * Stage 1 — Pseudonymize AuditLog: set `userId = NULL` for every row
 *   referencing the user. This is pseudonymization, NOT deletion —
 *   deleting audit rows breaks the hash chain and is refused by the
 *   IMMUTABLE_AUDIT_LOG trigger. NULL-userId is the GDPR-correct choice
 *   (Art. 17(3)(b): the audit trail is itself a compliance obligation).
 * Stage 2 — Hard-delete the User row + its `onDelete: Cascade` children
 *   (sessions, MFA enrolments, notification preferences). Authorship
 *   references (`onDelete: SetNull`) become "former user".
 * Stage 3 — Invalidate cached DEK material keyed on the user's email-hash
 *   (the per-tenant DEK itself is tenant-scoped and unaffected).
 * Stage 4 — Emit an anonymized verification report (which rows touched,
 *   which FKs nullified) as compliance evidence — no PII.
 */
export async function eraseUser(_userId: string): Promise<never> {
    throw new Error(
        'dsar-erasure: execution is not enabled (Stage 1 foundation — see docs/dsar.md)',
    );
}
