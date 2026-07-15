/**
 * Policy attestation — Audit Coherence S4 (2026-05-22).
 *
 * ISO 27001 §7.3 requires evidence that personnel have acknowledged
 * policies. The `PolicyAcknowledgement` model existed in the schema
 * but had no operational surface — no usecase, no API. This module
 * provides:
 *
 *   - `attestPolicy(ctx, policyId)` — current user records that they
 *     have read + accepted the policy's currently-published version.
 *     Idempotent on the `(policyVersionId, userId)` unique constraint.
 *   - `getPolicyAttestation(ctx, policyId, userId?)` — has the user
 *     attested the current version? Returns the row or null.
 *   - `listPolicyAttestations(ctx, policyId)` — admin/audit view of
 *     who has attested.
 *
 * Only PUBLISHED policies can be attested; attesting a DRAFT or
 * ARCHIVED version doesn't satisfy the ISO control.
 */
import { z } from 'zod';
import { Role } from '@prisma/client';
import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead, assertCanAdmin } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { PolicyRepository } from '../repositories/PolicyRepository';

export interface AttestPolicyResult {
    acknowledgementId: string;
    policyVersionId: string;
    userId: string;
    acknowledgedAt: Date;
    /** True if this call created a new row; false if the user had already attested. */
    created: boolean;
}

/**
 * Record an attestation for the current user against the policy's
 * currently-published version.
 *
 * Authorization — any tenant member can attest a policy they have
 * read access to (`assertCanRead`). Attestation is a "I have read
 * this" gesture — not a privileged write.
 *
 * Idempotency: the schema's `@@unique([policyVersionId, userId])`
 * means a second call returns the existing row with `created: false`.
 */
export async function attestPolicy(
    ctx: RequestContext,
    policyId: string,
): Promise<AttestPolicyResult> {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');

        if (policy.status !== 'PUBLISHED') {
            throw badRequest(
                `Only PUBLISHED policies can be attested. ${policyId} is ${policy.status}.`,
            );
        }
        if (!policy.currentVersionId) {
            throw badRequest(
                'Policy is PUBLISHED but has no currentVersionId — administrator must re-publish.',
            );
        }

        // Idempotent upsert via the (policyVersionId, userId) unique.
        const existing = await db.policyAcknowledgement.findUnique({
            where: {
                policyVersionId_userId: {
                    policyVersionId: policy.currentVersionId,
                    userId: ctx.userId,
                },
            },
        });
        if (existing) {
            return {
                acknowledgementId: existing.id,
                policyVersionId: existing.policyVersionId,
                userId: existing.userId,
                acknowledgedAt: existing.acknowledgedAt,
                created: false,
            };
        }

        const row = await db.policyAcknowledgement.create({
            data: {
                policyVersionId: policy.currentVersionId,
                userId: ctx.userId,
            },
        });

        await logEvent(db, ctx, {
            action: 'POLICY_ATTESTED',
            entityType: 'Policy',
            entityId: policyId,
            details: `User attested policy version ${policy.currentVersionId}`,
            detailsJson: {
                category: 'access',
                entityName: 'Policy',
                summary: `User ${ctx.userId} attested policy ${policyId}`,
                after: {
                    policyVersionId: policy.currentVersionId,
                    userId: ctx.userId,
                },
            },
        });

        return {
            acknowledgementId: row.id,
            policyVersionId: row.policyVersionId,
            userId: row.userId,
            acknowledgedAt: row.acknowledgedAt,
            created: true,
        };
    });
}

/**
 * Get a single user's attestation status for the policy's current
 * version. `userId` defaults to the caller; passing a different
 * userId requires admin authority (an admin checking who has /
 * hasn't attested).
 */
export async function getPolicyAttestation(
    ctx: RequestContext,
    policyId: string,
    userId?: string,
) {
    assertCanRead(ctx);
    const targetUserId = userId ?? ctx.userId;
    if (targetUserId !== ctx.userId) {
        assertCanAdmin(ctx);
    }

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');
        if (!policy.currentVersionId) return null;

        return db.policyAcknowledgement.findUnique({
            where: {
                policyVersionId_userId: {
                    policyVersionId: policy.currentVersionId,
                    userId: targetUserId,
                },
            },
        });
    });
}

/**
 * List every attestation for a policy's current version. Admin-only.
 * Surfaces the auditor report: "show me who has attested this policy".
 */
export async function listPolicyAttestations(
    ctx: RequestContext,
    policyId: string,
) {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');
        if (!policy.currentVersionId) return [];

        return db.policyAcknowledgement.findMany({
            where: { policyVersionId: policy.currentVersionId },
            orderBy: { acknowledgedAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });
    });
}

// ─── Required-acknowledgement campaign (assign + roster) ─────────────────

/**
 * Audience for a required-acknowledgement campaign. `all` targets every active
 * member; `role` targets active members holding a role; `users` targets a named
 * list (intersected with active membership so a stale id can't be assigned).
 */
export const RequireAcknowledgementSchema = z.object({
    audience: z.discriminatedUnion('type', [
        z.object({ type: z.literal('all') }),
        z.object({ type: z.literal('role'), role: z.nativeEnum(Role) }),
        z.object({ type: z.literal('users'), userIds: z.array(z.string().min(1)).min(1).max(2000) }),
    ]),
});
export type RequireAcknowledgementInput = z.infer<typeof RequireAcknowledgementSchema>;

export interface RequireAcknowledgementResult {
    policyVersionId: string;
    assignedCount: number;
}

/**
 * Require a set of users to acknowledge the policy's currently-published
 * version. Admin-only. Idempotent — re-running skips users already assigned to
 * this version (`skipDuplicates`). Assignees get an in-app notification.
 */
export async function requirePolicyAcknowledgement(
    ctx: RequestContext,
    policyId: string,
    input: RequireAcknowledgementInput,
): Promise<RequireAcknowledgementResult> {
    assertCanAdmin(ctx);
    const { audience } = RequireAcknowledgementSchema.parse(input);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');
        if (policy.status !== 'PUBLISHED') {
            throw badRequest(`Only PUBLISHED policies can require acknowledgement. ${policyId} is ${policy.status}.`);
        }
        if (!policy.currentVersionId) {
            throw badRequest('Policy is PUBLISHED but has no currentVersionId — administrator must re-publish.');
        }
        const policyVersionId = policy.currentVersionId;

        // Resolve the audience to a set of ACTIVE member userIds (a named list
        // is intersected with membership so a stale/foreign id is dropped).
        const members = await db.tenantMembership.findMany({
            where: {
                tenantId: ctx.tenantId,
                status: 'ACTIVE',
                ...(audience.type === 'role' ? { role: audience.role } : {}),
                ...(audience.type === 'users' ? { userId: { in: audience.userIds } } : {}),
            },
            select: { userId: true },
        });
        const userIds = [...new Set(members.map((m) => m.userId))];

        if (userIds.length === 0) {
            throw badRequest('The selected audience resolved to zero active members.');
        }

        await db.policyAcknowledgementAssignment.createMany({
            data: userIds.map((userId) => ({ policyVersionId, userId, assignedById: ctx.userId })),
            skipDuplicates: true,
        });

        // Notify each assignee (best-effort — a notification failure must not
        // fail the assignment). dedupeKey keeps a re-run from double-notifying.
        const title = `Action required: acknowledge "${policy.title}"`;
        const message = `You have been asked to read and acknowledge the policy "${policy.title}".`;
        for (const userId of userIds) {
            await db.notification
                .create({
                    data: {
                        tenantId: ctx.tenantId,
                        userId,
                        type: 'GENERAL',
                        title,
                        message,
                        linkUrl: `/policies/${policyId}`,
                        dedupeKey: `POLICY_ACK_REQUIRED:${policyVersionId}:${userId}`,
                    },
                })
                .catch(() => {
                    /* dedupe collision / notification failure must not fail dispatch */
                });
        }

        await logEvent(db, ctx, {
            action: 'POLICY_ACK_REQUESTED',
            entityType: 'Policy',
            entityId: policyId,
            details: `Required acknowledgement of policy version ${policyVersionId} from ${userIds.length} user(s)`,
            detailsJson: {
                category: 'access',
                entityName: 'Policy',
                summary: `Required acknowledgement of "${policy.title}" from ${userIds.length} user(s)`,
                after: { policyVersionId, audienceType: audience.type, assignedCount: userIds.length },
            },
        });

        return { policyVersionId, assignedCount: userIds.length };
    });
}

export interface AcknowledgementRosterEntry {
    userId: string;
    name: string | null;
    email: string | null;
    /** True when this user was REQUIRED to acknowledge (has an assignment). */
    required: boolean;
    /** When they acknowledged the current version, or null if outstanding. */
    acknowledgedAt: Date | null;
}

export interface AcknowledgementRoster {
    policyVersionId: string | null;
    assignedCount: number;
    acknowledgedCount: number;
    /** % of REQUIRED users who have acknowledged the current version. */
    pctComplete: number;
    entries: AcknowledgementRosterEntry[];
}

/**
 * Admin roster for the current published version: who was required to
 * acknowledge, who has (with timestamps), % complete, and voluntary
 * acknowledgers (acknowledged without being assigned). Admin/audit only.
 */
export async function getPolicyAcknowledgementRoster(
    ctx: RequestContext,
    policyId: string,
): Promise<AcknowledgementRoster> {
    assertCanAdmin(ctx);

    return runInTenantContext(ctx, async (db) => {
        const policy = await PolicyRepository.getById(db, ctx, policyId);
        if (!policy) throw notFound('Policy not found');
        if (!policy.currentVersionId) {
            return { policyVersionId: null, assignedCount: 0, acknowledgedCount: 0, pctComplete: 0, entries: [] };
        }
        const policyVersionId = policy.currentVersionId;

        const [assignments, acknowledgements] = await Promise.all([
            db.policyAcknowledgementAssignment.findMany({ where: { policyVersionId }, select: { userId: true }, take: 5000 }),
            db.policyAcknowledgement.findMany({ where: { policyVersionId }, select: { userId: true, acknowledgedAt: true }, take: 5000 }),
        ]);

        const assignedUserIds = new Set(assignments.map((a) => a.userId));
        const ackByUser = new Map(acknowledgements.map((a) => [a.userId, a.acknowledgedAt]));

        // Union of required + voluntary acknowledgers → resolve display info.
        const allUserIds = [...new Set([...assignedUserIds, ...ackByUser.keys()])];
        const users = allUserIds.length
            ? await db.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, name: true, email: true } })
            : [];
        const userById = new Map(users.map((u) => [u.id, u]));

        const entries: AcknowledgementRosterEntry[] = allUserIds.map((userId) => ({
            userId,
            name: userById.get(userId)?.name ?? null,
            email: userById.get(userId)?.email ?? null,
            required: assignedUserIds.has(userId),
            acknowledgedAt: ackByUser.get(userId) ?? null,
        }));
        // Outstanding (required, not acknowledged) first, then acknowledged.
        entries.sort((a, b) => {
            const aOut = a.required && !a.acknowledgedAt ? 0 : 1;
            const bOut = b.required && !b.acknowledgedAt ? 0 : 1;
            if (aOut !== bOut) return aOut - bOut;
            return (a.email ?? '').localeCompare(b.email ?? '');
        });

        const assignedCount = assignedUserIds.size;
        const acknowledgedCount = [...assignedUserIds].filter((id) => ackByUser.has(id)).length;
        const pctComplete = assignedCount > 0 ? Math.round((acknowledgedCount / assignedCount) * 100) : 0;

        return { policyVersionId, assignedCount, acknowledgedCount, pctComplete, entries };
    });
}
