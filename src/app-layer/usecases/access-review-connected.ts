/**
 * Connected-app access reviews (PR-7) — the CONNECTED_APP scope.
 *
 * Reviews connected identity-provider accounts (Okta / Google Workspace,
 * PR-2's ConnectedIdentityAccount) rather than tenant memberships. Kept in a
 * SEPARATE module writing to AccessReviewConnectedDecision so the mature
 * member-review flow (access-review.ts) is 100% untouched.
 *
 * On close, a REVOKE/MODIFY emits a remediation Task (we do not write back to
 * the IdP automatically — deprovisioning is a gated, out-of-band action).
 */
import { z } from 'zod';
import { RequestContext } from '../types';
import { AccessReviewRepository } from '../repositories/AccessReviewRepository';
import { assertCanAdmin, assertCanRead } from '../policies/common';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { badRequest, notFound, forbidden } from '@/lib/errors/types';

const IDENTITY_PROVIDERS = ['okta', 'google-workspace'];
const MAX_SUBJECTS = 5000;

export const CreateConnectedAccessReviewSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    /** Restrict to one provider; omit to review all connected identity accounts. */
    provider: z.enum(['okta', 'google-workspace']).optional(),
    reviewerUserId: z.string().min(1),
    dueAt: z.coerce.date().optional(),
    periodStartAt: z.coerce.date().optional(),
    periodEndAt: z.coerce.date().optional(),
});

export interface CreateConnectedResult {
    accessReviewId: string;
    snapshotCount: number;
}

export async function createConnectedAccessReview(ctx: RequestContext, input: unknown): Promise<CreateConnectedResult> {
    assertCanAdmin(ctx);
    const parsed = CreateConnectedAccessReviewSchema.parse(input);

    return runInTenantContext(ctx, async (db) => {
        const accounts = await db.connectedIdentityAccount.findMany({
            where: { tenantId: ctx.tenantId, status: 'ACTIVE', provider: parsed.provider ? parsed.provider : { in: IDENTITY_PROVIDERS } },
            select: { id: true, provider: true, email: true, displayName: true, isAdmin: true, mfaEnrolled: true, groupsJson: true },
            take: MAX_SUBJECTS,
        });
        if (accounts.length === 0) {
            throw badRequest('No active connected identity accounts match the requested scope — the campaign would have zero subjects. Sync Okta / Google Workspace first.');
        }

        const review = await AccessReviewRepository.create(db, ctx, {
            name: sanitizePlainText(parsed.name),
            description: parsed.description ? sanitizePlainText(parsed.description) : null,
            scope: 'CONNECTED_APP',
            periodStartAt: parsed.periodStartAt ?? null,
            periodEndAt: parsed.periodEndAt ?? null,
            reviewerUserId: parsed.reviewerUserId,
            dueAt: parsed.dueAt ?? null,
        });

        // Freeze each entitlement into snapshotJson so the decision is against
        // the reviewed state, not a later drifted directory.
        await db.accessReviewConnectedDecision.createMany({
            data: accounts.map((a) => ({
                tenantId: ctx.tenantId,
                accessReviewId: review.id,
                connectedAccountId: a.id,
                subjectRef: `${a.provider}:${a.email}`,
                snapshotJson: { provider: a.provider, email: a.email, displayName: a.displayName, isAdmin: a.isAdmin, mfaEnrolled: a.mfaEnrolled, groups: a.groupsJson },
            })),
            skipDuplicates: true,
        });

        await logEvent(db, ctx, {
            action: 'ACCESS_REVIEW_CREATED',
            entityType: 'AccessReview',
            entityId: review.id,
            detailsJson: { category: 'entity_lifecycle', entityName: 'AccessReview', operation: 'create', summary: `Connected-app access review "${review.name}" created with ${accounts.length} account(s)`, after: { scope: 'CONNECTED_APP', snapshotCount: accounts.length, provider: parsed.provider ?? 'all' } },
        });

        return { accessReviewId: review.id, snapshotCount: accounts.length };
    });
}

export async function listConnectedDecisions(ctx: RequestContext, accessReviewId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.accessReviewConnectedDecision.findMany({
            where: { tenantId: ctx.tenantId, accessReviewId },
            select: { id: true, subjectRef: true, snapshotJson: true, decision: true, decidedAt: true, notes: true, executedAt: true },
            orderBy: { subjectRef: 'asc' },
            take: MAX_SUBJECTS,
        }),
    );
}

export const SubmitConnectedDecisionSchema = z.object({
    decision: z.enum(['CONFIRM', 'REVOKE', 'MODIFY']),
    notes: z.string().max(2000).optional(),
});

export async function submitConnectedDecision(ctx: RequestContext, decisionId: string, input: unknown, now: Date = new Date()) {
    assertCanRead(ctx);
    const parsed = SubmitConnectedDecisionSchema.parse(input);
    return runInTenantContext(ctx, async (db) => {
        // H4 — a CONNECTED_APP verdict becomes SOC 2 evidence and spawns
        // deprovision tasks, so it must carry the SAME reviewer gate as the
        // member flow: only the campaign's assigned reviewer (or a tenant admin)
        // may decide, and never on a CLOSED campaign. Previously this was
        // assertCanRead ONLY — any read-only member could record verdicts.
        const decision = await db.accessReviewConnectedDecision.findFirst({
            where: { id: decisionId, tenantId: ctx.tenantId },
            select: { id: true, decision: true, accessReview: { select: { reviewerUserId: true, status: true, deletedAt: true } } },
        });
        if (!decision || !decision.accessReview || decision.accessReview.deletedAt !== null) throw notFound('Decision not found.');
        if (decision.accessReview.status === 'CLOSED') throw badRequest('This campaign is closed; decisions are immutable.');
        const isAssignedReviewer = decision.accessReview.reviewerUserId === ctx.userId;
        if (!isAssignedReviewer && !ctx.permissions?.canAdmin) {
            throw forbidden('Only the assigned reviewer (or a tenant admin) may submit connected-app decisions.');
        }

        const res = await db.accessReviewConnectedDecision.updateMany({
            where: { id: decisionId, tenantId: ctx.tenantId, decision: null },
            data: { decision: parsed.decision, notes: parsed.notes ? sanitizePlainText(parsed.notes) : null, decidedAt: now, decidedByUserId: ctx.userId },
        });
        if (res.count === 0) throw badRequest('Decision not found or already decided.');
        return { decisionId, decision: parsed.decision };
    });
}

export interface CloseConnectedResult {
    accessReviewId: string;
    executed: number;
    remediationTasks: number;
}

/**
 * Close a CONNECTED_APP review. Rejects pending decisions, emits a remediation
 * Task for every REVOKE/MODIFY (deprovisioning is out-of-band, not auto), marks
 * each decision executed, and flips the campaign CLOSED. Delegated to from
 * `closeAccessReview` when the campaign scope is CONNECTED_APP.
 */
export async function closeConnectedAccessReview(ctx: RequestContext, accessReviewId: string, now: Date = new Date()): Promise<CloseConnectedResult> {
    assertCanAdmin(ctx);
    return runInTenantContext(ctx, async (db) => {
        const review = await db.accessReview.findFirst({ where: { id: accessReviewId, tenantId: ctx.tenantId }, select: { id: true, name: true, status: true, deletedAt: true } });
        if (!review || review.deletedAt !== null) throw notFound('Access review not found');
        if (review.status === 'CLOSED') throw badRequest('Campaign is already closed.');

        const decisions = await db.accessReviewConnectedDecision.findMany({ where: { tenantId: ctx.tenantId, accessReviewId }, select: { id: true, subjectRef: true, decision: true, executedAt: true } });
        const pending = decisions.filter((d) => d.decision === null);
        if (pending.length > 0) {
            throw badRequest(`Cannot close: ${pending.length} decision(s) are still pending. Every account must be CONFIRMed, REVOKEd, or MODIFYd before close.`);
        }

        // H4 — win the conditional close BEFORE creating any side effects. Two
        // concurrent closes both pass the read-check above, but only one
        // transitions the campaign to CLOSED; the loser gets count===0 and bails
        // without creating duplicate remediation tasks.
        const closed = await AccessReviewRepository.closeCampaign(db, ctx, accessReviewId, now);
        if (closed === 0) {
            return { accessReviewId, executed: decisions.length, remediationTasks: 0 };
        }

        let remediationTasks = 0;
        for (const d of decisions) { // guardrail-allow: n+1 — per-decision, bounded by campaign size
            // Skip decisions already executed by a prior (partial) close — idempotent.
            if (d.executedAt) continue;
            if (d.decision === 'REVOKE' || d.decision === 'MODIFY') {
                await db.task.create({
                    data: {
                        tenantId: ctx.tenantId,
                        title: `Deprovision access: ${d.subjectRef}`.slice(0, 250),
                        description: `Access review "${review.name}" decided ${d.decision} for ${d.subjectRef}. Remove or adjust this account in the identity provider, then close this task.`,
                        createdByUserId: ctx.userId,
                        source: 'MANUAL',
                    },
                });
                remediationTasks += 1;
            }
            await db.accessReviewConnectedDecision.updateMany({ where: { id: d.id, tenantId: ctx.tenantId, executedAt: null }, data: { executedAt: now, executedByUserId: ctx.userId } });
        }

        await logEvent(db, ctx, {
            action: 'ACCESS_REVIEW_DECISION_EXECUTED',
            entityType: 'AccessReview',
            entityId: accessReviewId,
            detailsJson: { category: 'access', entityName: 'AccessReview', operation: 'close', summary: `Closed connected-app review "${review.name}" — ${decisions.length} decision(s), ${remediationTasks} remediation task(s)`, after: { executed: decisions.length, remediationTasks } },
        });

        return { accessReviewId, executed: decisions.length, remediationTasks };
    });
}
