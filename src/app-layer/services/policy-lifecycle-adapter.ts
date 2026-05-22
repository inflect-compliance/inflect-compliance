/**
 * Policy Lifecycle Adapter — Bridges Policy domain to the generic EditableLifecycle.
 *
 * This module provides:
 * 1. `PolicyPayload` — The editable content shape for Policy versions.
 * 2. `PolicyEditableAdapter` — Maps between Prisma Policy/PolicyVersion models
 *    and the generic `EditableState<PolicyPayload>`.
 * 3. Shared audit config and validation for the Policy lifecycle.
 *
 * Architecture:
 * ─────────────
 *   policy.ts (usecase)
 *       → PolicyEditableAdapter (this file)
 *           → EditableState<PolicyPayload> (generic lifecycle)
 *           → PolicyRepository / PolicyVersionRepository (Prisma persistence)
 *
 * Migration strategy:
 * ───────────────────
 * This adapter coexists with the existing PolicyRepository and PolicyVersionRepository.
 * It does NOT replace the Prisma models or modify the schema. Instead, it provides a
 * read/write translation layer:
 *
 * - **loadState** reads Policy + PolicyVersion rows and assembles EditableState
 * - **saveState** writes back to the same Prisma models
 *
 * This enables gradual adoption: the policy.ts usecase can delegate lifecycle
 * transitions to the generic service while preserving all existing behavior,
 * authorization, and API contracts.
 *
 * @module app-layer/services/policy-lifecycle-adapter
 */

import { Prisma, PolicyStatus, PolicyContentType } from '@prisma/client';
import type { PrismaTx } from '@/lib/db-context';
import type {
    EditableState,
    PublishedSnapshot,
    EditablePhase,
} from '../domain/editable-lifecycle.types';
import type { EditableRepository, LifecycleAuditConfig, PublishValidator } from '../usecases/editable-lifecycle-usecase';

// ─── Policy Payload ──────────────────────────────────────────────────

/**
 * The editable content for a policy version.
 *
 * This is the `TPayload` that the generic lifecycle operates on.
 * It maps 1:1 to the PolicyVersion Prisma model fields.
 */
export interface PolicyPayload {
    /** Content type: MARKDOWN, HTML, or EXTERNAL_LINK */
    readonly contentType: PolicyContentType;
    /** Content text for MARKDOWN/HTML types */
    readonly contentText: string | null;
    /** External URL for EXTERNAL_LINK type */
    readonly externalUrl: string | null;
    /** Human-readable change summary for audit trail */
    readonly changeSummary: string | null;
}

// ─── Phase Mapping ───────────────────────────────────────────────────

/**
 * Map Prisma PolicyStatus to EditablePhase.
 *
 * The existing PolicyStatus enum has 5 values (DRAFT, IN_REVIEW, APPROVED,
 * PUBLISHED, ARCHIVED), while EditablePhase has 3 (DRAFT, PUBLISHED, ARCHIVED).
 *
 * IN_REVIEW and APPROVED are intermediate approval states that map to DRAFT
 * in the lifecycle sense — they represent "not yet published" content.
 *
 * This mapping is intentionally lossy in the DRAFT direction because the
 * approval workflow (IN_REVIEW → APPROVED) is orthogonal to the publish
 * lifecycle. The approval status is preserved separately on the Policy model.
 */
export function policyStatusToPhase(status: string): EditablePhase {
    switch (status) {
        case 'PUBLISHED':
            return 'PUBLISHED';
        case 'ARCHIVED':
            return 'ARCHIVED';
        default:
            // DRAFT, IN_REVIEW, APPROVED all map to DRAFT phase
            return 'DRAFT';
    }
}

/**
 * Map EditablePhase back to Prisma PolicyStatus for persistence.
 *
 * This is a direct mapping — the approval workflow status (IN_REVIEW, APPROVED)
 * is handled separately by the approval usecase, not by the lifecycle.
 */
export function phaseToDefaultPolicyStatus(phase: EditablePhase): string {
    switch (phase) {
        case 'PUBLISHED':
            return 'PUBLISHED';
        case 'ARCHIVED':
            return 'ARCHIVED';
        case 'DRAFT':
        default:
            return 'DRAFT';
    }
}

// ─── Audit Config ────────────────────────────────────────────────────

/**
 * Audit configuration for the Policy lifecycle.
 *
 * Produces audit actions matching the existing naming convention:
 * - POLICY_DRAFT_UPDATED
 * - POLICY_PUBLISHED
 * - POLICY_VERSION_CREATED
 * - POLICY_REVERTED
 * - POLICY_ARCHIVED
 */
export const POLICY_AUDIT_CONFIG: LifecycleAuditConfig = {
    entityType: 'Policy',
    actionPrefix: 'POLICY',
};

import { badRequest } from '@/lib/errors/types';

/**
 * Pre-publish validation for policy content.
 *
 * Enforces the same rules as the existing `createPolicyVersion`:
 * - EXTERNAL_LINK requires externalUrl
 * - MARKDOWN/HTML requires contentText
 */
export const validatePolicyPayload: PublishValidator<PolicyPayload> = (draft) => {
    if (draft.contentType === PolicyContentType.EXTERNAL_LINK && !draft.externalUrl) {
        throw badRequest('externalUrl is required for EXTERNAL_LINK content type');
    }
    if ((draft.contentType === PolicyContentType.MARKDOWN || draft.contentType === PolicyContentType.HTML) && !draft.contentText) {
        throw badRequest('contentText is required for MARKDOWN/HTML content type');
    }
};

/**
 * Adapts Policy Prisma models to the generic EditableRepository interface.
 *
 * This is the bridge between the Prisma data model and the pure lifecycle.
 *
 * Persistence strategy (GAP-5 — CISO-Assistant alignment):
 * ─────────────────────────────────────────────────────────
 * Version and history are persisted using two dedicated columns:
 *   - `lifecycleVersion` (Int) — Matches CISO-Assistant `editing_version`
 *   - `lifecycleHistoryJson` (Json?) — Matches CISO-Assistant `editing_history`
 *
 * loadState:
 *   1. Reads Policy + PolicyVersion rows for draft/published content
 *   2. Reads `lifecycleVersion` for the version counter
 *   3. Reads `lifecycleHistoryJson` for history (falling back to version-row
 *      reconstruction for backward compatibility with pre-migration data)
 *
 * saveState:
 *   1. Persists status, currentVersionId (existing behavior)
 *   2. Persists `lifecycleVersion` and `lifecycleHistoryJson` (new)
 *   3. Creates PolicyVersion rows on publish (existing behavior)
 */
export class PolicyEditableAdapter implements EditableRepository<PolicyPayload> {
    constructor(
        private readonly tenantId: string,
        private readonly userId: string,
    ) {}

    async loadState(db: PrismaTx, policyId: string): Promise<EditableState<PolicyPayload> | null> {
        const policy = await db.policy.findFirst({
            where: { id: policyId, tenantId: this.tenantId },
            include: {
                currentVersion: true,
                versions: {
                    orderBy: { versionNumber: 'asc' },
                },
            },
        });

        if (!policy) return null;

        const phase = policyStatusToPhase(policy.status);
        const versions = policy.versions || [];
        const currentVersion = policy.currentVersion;

        // ── Version counter ──────────────────────────────────────────
        // Prefer persisted lifecycleVersion; fall back to versionNumber for legacy data
        const currentVersionNumber = policy.lifecycleVersion ?? currentVersion?.versionNumber ?? 1;

        // ── Published payload ────────────────────────────────────────
        let published: PolicyPayload | null = null;
        if (currentVersion) {
            published = {
                contentType: currentVersion.contentType,
                contentText: currentVersion.contentText,
                externalUrl: currentVersion.externalUrl,
                changeSummary: currentVersion.changeSummary,
            };
        }

        // ── Draft detection ──────────────────────────────────────────
        let draft: PolicyPayload | null = null;
        if (phase === 'DRAFT' && versions.length > 0) {
            const latestVersion = versions[versions.length - 1];
            if (!currentVersion || latestVersion.id !== currentVersion.id) {
                draft = {
                    contentType: latestVersion.contentType,
                    contentText: latestVersion.contentText,
                    externalUrl: latestVersion.externalUrl,
                    changeSummary: latestVersion.changeSummary,
                };
            } else if (phase === 'DRAFT' && currentVersion) {
                draft = published;
            }
        }

        // ── History ──────────────────────────────────────────────────
        // Prefer persisted lifecycleHistoryJson; fall back to version-row reconstruction
        const persistedHistory = policy.lifecycleHistoryJson;
        let history: PublishedSnapshot<PolicyPayload>[];

        if (Array.isArray(persistedHistory) && persistedHistory.length > 0) {
            // Use persisted history (post-migration data)
            history = persistedHistory as unknown as PublishedSnapshot<PolicyPayload>[];
        } else {
            // Fall back to reconstruction from PolicyVersion rows (pre-migration data)
            history = versions
                .filter(v => currentVersion ? v.id !== currentVersion.id : false)
                .filter(v => draft ? v.versionNumber !== versions[versions.length - 1].versionNumber : true)
                .map(v => ({
                    version: v.versionNumber,
                    payload: {
                        contentType: v.contentType,
                        contentText: v.contentText,
                        externalUrl: v.externalUrl,
                        changeSummary: v.changeSummary,
                    },
                    publishedAt: v.createdAt.toISOString(),
                    publishedBy: v.createdById,
                    changeSummary: v.changeSummary ?? undefined,
                }));
        }

        return {
            phase,
            currentVersion: currentVersionNumber,
            draft,
            published,
            // Attribution for correct history snapshots (CQ-3)
            publishedBy: phase === 'PUBLISHED' && currentVersion ? currentVersion.createdById : null,
            publishedChangeSummary: phase === 'PUBLISHED' && currentVersion ? (currentVersion.changeSummary ?? null) : null,
            history,
        };
    }

    async saveState(db: PrismaTx, policyId: string, state: EditableState<PolicyPayload>): Promise<void> {
        const newStatus = phaseToDefaultPolicyStatus(state.phase);

        // Serialize history for persistence
        const historyJson = state.history.length > 0 ? state.history : undefined;

        if (state.phase === 'PUBLISHED' && state.published !== null) {
            // Check if this version row already exists (idempotency)
            const existing = await db.policyVersion.findFirst({
                where: { policyId, versionNumber: state.currentVersion },
            });

            if (!existing) {
                // CQ-1 fix: use state.currentVersion as authoritative version number
                // instead of independently recomputing from DB (eliminates divergence risk)
                const newVersion = await db.policyVersion.create({
                    data: {
                        tenantId: this.tenantId,
                        policyId,
                        versionNumber: state.currentVersion,
                        contentType: state.published.contentType,
                        contentText: state.published.contentText,
                        externalUrl: state.published.externalUrl,
                        changeSummary: state.published.changeSummary,
                        createdById: this.userId,
                    },
                });

                await db.policy.updateMany({
                    where: { id: policyId, tenantId: this.tenantId },
                    data: {
                        currentVersionId: newVersion.id,
                        status: newStatus as PolicyStatus,
                        lifecycleVersion: state.currentVersion,
                        ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                    },
                });
            } else {
                await db.policy.updateMany({
                    where: { id: policyId, tenantId: this.tenantId },
                    data: {
                        currentVersionId: existing.id,
                        status: newStatus as PolicyStatus,
                        lifecycleVersion: state.currentVersion,
                        ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                    },
                });
            }
        } else {
            // Not a publish — update status + lifecycle metadata
            await db.policy.updateMany({
                where: { id: policyId, tenantId: this.tenantId },
                data: {
                    status: newStatus as PolicyStatus,
                    lifecycleVersion: state.currentVersion,
                    ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                },
            });
        }
    }
}
