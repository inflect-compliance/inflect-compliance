/**
 * DSAR export bundle (GDPR Art. 15 right-of-access).
 *
 * ⚠️ STAGE 1 FOUNDATION — execution is NOT enabled. This file documents
 * the bundle contract; it is NOT registered in register-schedules /
 * executor-registry, so it never runs. The export pipeline (decrypt
 * authored content via the per-tenant DEK, write to the evidence S3
 * bucket, 7-day signed URL, email the link) lands in the Stage 2 PR (see
 * docs/dsar.md). Export is reversible, so it sequences before erasure.
 *
 * @module app-layer/jobs/dsar-export
 */
import { DSAR_EXPORT_TTL_DAYS } from '@/lib/dsar';

/** Signed-URL lifetime for the produced bundle. */
export const EXPORT_TTL_DAYS = DSAR_EXPORT_TTL_DAYS;

/**
 * The canonical bundle layout (the Stage 2 implementation produces this
 * under a one-time-use prefix in the evidence S3 bucket):
 *
 *   user.json               — the User row, all fields
 *   tenants.json            — each tenant the user is a member of (their
 *                             MEMBERSHIP row, not the tenant's data)
 *   sessions.json           — UserSession history
 *   audit-log-as-actor.json — every AuditLog entry where the user is actor
 *   authored-content/       — Risk descriptions, Task comments, etc. they
 *                             wrote (decrypted via the per-tenant DEK)
 *   metadata.json           — version, timestamp, request id, signed checksum
 */
export const EXPORT_BUNDLE_FILES = [
    'user.json',
    'tenants.json',
    'sessions.json',
    'audit-log-as-actor.json',
    'authored-content/',
    'metadata.json',
] as const;

/** Produce the export bundle. NOT enabled in Stage 1 — throws. */
export async function exportUser(_userId: string): Promise<never> {
    throw new Error(
        'dsar-export: execution is not enabled (Stage 1 foundation — see docs/dsar.md)',
    );
}
