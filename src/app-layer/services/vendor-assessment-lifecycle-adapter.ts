/**
 * Vendor Assessment Lifecycle Adapter — Bridges the VendorAssessment domain
 * to the generic EditableLifecycle.
 *
 * Domain semantics:
 * ─────────────────
 * VendorAssessments have a natural draft/submit/approve workflow:
 *
 *   DRAFT (fill in answers) → submit → IN_REVIEW → decide → APPROVED | REJECTED
 *
 * This maps to the generic lifecycle as:
 *   DRAFT → "publish" (submit) → PUBLISHED (approved)
 *
 * The adapter treats "submit for review" as the publish action, and
 * "approve" as the finalization. This preserves the existing approval
 * gate semantics while gaining version history: when a vendor is
 * re-assessed, the prior approved assessment is snapshotted to history.
 *
 * What the lifecycle adds:
 * ────────────────────────
 * 1. **Version history of prior assessments** — When the same vendor
 *    is assessed again and approved, the prior approved assessment's
 *    answers + score are captured in history for compliance audit.
 * 2. **Consistent audit trail** — All lifecycle transitions emit
 *    standardized audit events.
 * 3. **Revert capability** — Auditors can view or revert to prior
 *    assessment results.
 *
 * Important: This adapter does NOT replace the existing submit/decide
 * workflow in vendor.ts. It provides a parallel lifecycle foundation
 * that can be gradually integrated.
 *
 * @module app-layer/services/vendor-assessment-lifecycle-adapter
 */

import { Prisma, AssessmentStatus, VendorCriticality } from '@prisma/client';
import type { PrismaTx } from '@/lib/db-context';
import type {
    EditablePhase,
    EditableState,
    PublishedSnapshot,
} from '../domain/editable-lifecycle.types';
import type { EditableRepository, LifecycleAuditConfig, PublishValidator } from '../usecases/editable-lifecycle-usecase';

// ─── Vendor Assessment Payload ───────────────────────────────────────

/**
 * The snapshotable content of a vendor assessment.
 *
 * This captures the "result" of an assessment at a point in time:
 * - The answers to questionnaire questions
 * - The computed score and risk rating
 * - Reviewer notes
 *
 * This shape is what gets versioned in history when a new assessment
 * replaces a prior one.
 */
export interface VendorAssessmentPayload {
    /** Template key used for this assessment */
    readonly templateKey: string;
    /** Template name for display */
    readonly templateName: string;
    /** Answers as question→answer pairs */
    readonly answers: ReadonlyArray<{
        readonly questionId: string;
        readonly answerJson: unknown;
        readonly computedPoints: number;
    }>;
    /** Computed assessment score */
    readonly score: number | null;
    /** Derived risk rating (LOW, MEDIUM, HIGH, CRITICAL) */
    readonly riskRating: VendorCriticality | null;
    /** Reviewer/decider notes */
    readonly notes: string | null;
}

// ─── Phase Mapping ───────────────────────────────────────────────────

/**
 * Map Prisma AssessmentStatus to EditablePhase.
 *
 * Assessment lifecycle:
 *   DRAFT      → DRAFT     (filling in answers)
 *   IN_REVIEW  → DRAFT     (submitted but not yet finalized — still "in progress")
 *   APPROVED   → PUBLISHED (the assessment is the authoritative result)
 *   REJECTED   → DRAFT     (sent back for rework)
 *
 * Design rationale for IN_REVIEW → DRAFT:
 * ────────────────────────────────────────
 * From the lifecycle perspective, an assessment is "not yet finalized"
 * until approved. IN_REVIEW is an intermediate approval state, not
 * a published/live state. This matches the Policy pilot's treatment
 * of IN_REVIEW and APPROVED (approval workflow is orthogonal to
 * the publish lifecycle).
 */
export function assessmentStatusToPhase(status: string): EditablePhase {
    switch (status) {
        case 'APPROVED':
            return 'PUBLISHED';
        default:
            // DRAFT, IN_REVIEW, REJECTED all map to DRAFT phase
            return 'DRAFT';
    }
}

/**
 * Map EditablePhase back to AssessmentStatus for persistence.
 *
 * Only DRAFT and PUBLISHED are meaningful here — ARCHIVED is not
 * part of the current assessment model (assessments are not archived,
 * they're replaced by new assessments).
 */
export function phaseToAssessmentStatus(phase: EditablePhase): string {
    switch (phase) {
        case 'PUBLISHED':
            return 'APPROVED';
        case 'ARCHIVED':
            // Assessments don't have an ARCHIVED status, but if the lifecycle
            // tries to archive, map to APPROVED (preserves the final state)
            return 'APPROVED';
        case 'DRAFT':
        default:
            return 'DRAFT';
    }
}

// ─── Audit Config ────────────────────────────────────────────────────

/**
 * Audit configuration for the VendorAssessment lifecycle.
 *
 * Produces actions matching the existing naming convention:
 * - ASSESSMENT_DRAFT_UPDATED (answers saved)
 * - ASSESSMENT_PUBLISHED (assessment approved/finalized)
 * - ASSESSMENT_VERSION_CREATED (prior assessment snapshotted)
 * - ASSESSMENT_REVERTED (reverted to prior assessment)
 */
export const VENDOR_ASSESSMENT_AUDIT_CONFIG: LifecycleAuditConfig = {
    entityType: 'VendorAssessment',
    actionPrefix: 'ASSESSMENT',
};

import { badRequest } from '@/lib/errors/types';

/**
 * Pre-submit validation for vendor assessments.
 *
 * Enforces the same business rule as the existing workflow:
 * An assessment must have at least one answered question before
 * it can be submitted/finalized.
 */
export const validateAssessmentPayload: PublishValidator<VendorAssessmentPayload> = (draft) => {
    if (!draft.answers || draft.answers.length === 0) {
        throw badRequest('Assessment must have at least one answered question before submitting');
    }
};

// ─── Scoring Helpers ─────────────────────────────────────────────────

/**
 * Derive a risk rating from a percent score.
 *
 * This mirrors the existing `scoreToRiskRating` function in vendor-scoring.ts
 * for use in lifecycle validation and display context.
 *
 * Thresholds (matching existing):
 *   0-25%   → CRITICAL
 *   26-50%  → HIGH
 *   51-75%  → MEDIUM
 *   76-100% → LOW
 */
export function deriveRiskRating(percentScore: number): VendorCriticality {
    if (percentScore <= 25) return VendorCriticality.CRITICAL;
    if (percentScore <= 50) return VendorCriticality.HIGH;
    if (percentScore <= 75) return VendorCriticality.MEDIUM;
    return VendorCriticality.LOW;
}

// ─── Repository Adapter ─────────────────────────────────────────────

/**
 * Adapts VendorAssessment Prisma models to the generic EditableRepository.
 *
 * Key differences from PolicyEditableAdapter:
 * ───────────────────────────────────────────
 * Policy uses separate PolicyVersion rows for each version. VendorAssessment
 * has a flat model: one row + inline answers. There are no "version rows."
 *
 * Persistence strategy (GAP-5 — CISO-Assistant alignment):
 * ────────────────────────────────────────────────────────
 * Version and history are persisted using two dedicated columns:
 *   - `lifecycleVersion` (Int) — Matches CISO-Assistant `editing_version`
 *   - `lifecycleHistoryJson` (Json?) — Matches CISO-Assistant `editing_history`
 *
 * loadState:
 *   1. Read VendorAssessment + template + answers
 *   2. Read `lifecycleVersion` for version counter (fallback: derive from status)
 *   3. Read `lifecycleHistoryJson` for history (fallback: empty array for legacy data)
 *
 * saveState:
 *   1. Update VendorAssessment status
 *   2. On publish: update score, riskRating, decidedByUserId, decidedAt
 *   3. Upsert answers from the published payload
 *   4. Persist `lifecycleVersion` and `lifecycleHistoryJson` on all paths
 *
 * @see PolicyEditableAdapter for the Policy domain equivalent
 */
export class VendorAssessmentEditableAdapter implements EditableRepository<VendorAssessmentPayload> {
    constructor(
        private readonly tenantId: string,
        private readonly userId: string,
    ) {}

    async loadState(db: PrismaTx, assessmentId: string): Promise<EditableState<VendorAssessmentPayload> | null> {
        const assessment = await db.vendorAssessment.findFirst({
            where: { id: assessmentId, tenantId: this.tenantId },
            include: {
                template: true,
                answers: {
                    orderBy: { createdAt: 'asc' },
                    include: { question: true },
                },
            },
        });

        if (!assessment) return null;

        const phase = assessmentStatusToPhase(assessment.status);

        // Build the payload from current assessment state. Epic G-3
        // made the legacy template relation nullable; the lifecycle
        // adapter only fires for the legacy approval-workflow flow,
        // so we still expect the template to be present here.
        if (!assessment.template) {
            throw new Error(
                `Lifecycle snapshot requires a legacy template — assessment ${assessment.id} carries only templateVersionId.`,
            );
        }
        const payload: VendorAssessmentPayload = {
            templateKey: assessment.template.key,
            templateName: assessment.template.name,
            answers: assessment.answers.map(a => ({
                questionId: a.questionId,
                answerJson: a.answerJson,
                computedPoints: a.computedPoints,
            })),
            score: assessment.score,
            riskRating: assessment.riskRating,
            notes: assessment.notes,
        };

        // Determine draft vs published based on phase
        const isDraft = phase === 'DRAFT';
        const hasBeenApproved = assessment.decidedAt !== null && assessment.status === 'APPROVED';

        // ── Version counter ──────────────────────────────────────────
        // Prefer persisted lifecycleVersion; fall back to derived value for legacy data
        const currentVersion = assessment.lifecycleVersion ?? (hasBeenApproved ? 2 : 1);

        // ── History ──────────────────────────────────────────────────
        // Prefer persisted lifecycleHistoryJson; fall back to empty for legacy data
        const persistedHistory = assessment.lifecycleHistoryJson;
        const history: PublishedSnapshot<VendorAssessmentPayload>[] =
            Array.isArray(persistedHistory)
                ? (persistedHistory as unknown as PublishedSnapshot<VendorAssessmentPayload>[])
                : [];

        return {
            phase,
            currentVersion,
            draft: isDraft ? payload : null,
            published: hasBeenApproved ? payload : null,
            // Attribution for correct history snapshots (CQ-3)
            publishedBy: hasBeenApproved ? (assessment.decidedByUserId ?? null) : null,
            publishedChangeSummary: hasBeenApproved ? (assessment.notes ?? null) : null,
            history,
        };
    }

    async saveState(db: PrismaTx, assessmentId: string, state: EditableState<VendorAssessmentPayload>): Promise<void> {
        const newStatus = phaseToAssessmentStatus(state.phase);

        // Serialize history for persistence
        const historyJson = state.history.length > 0 ? state.history : undefined;

        if (state.phase === 'PUBLISHED' && state.published !== null) {
            // Publishing = approval: update assessment with score/rating + status + lifecycle
            await db.vendorAssessment.updateMany({
                where: { id: assessmentId, tenantId: this.tenantId },
                data: {
                    status: newStatus as AssessmentStatus,
                    score: state.published.score,
                    riskRating: state.published.riskRating,
                    notes: state.published.notes,
                    decidedByUserId: this.userId,
                    decidedAt: new Date(),
                    lifecycleVersion: state.currentVersion,
                    ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                },
            });

            // Upsert answers from the published payload
            for (const answer of state.published.answers) {
                await db.vendorAssessmentAnswer.upsert({
                    where: {
                        assessmentId_questionId: {
                            assessmentId,
                            questionId: answer.questionId,
                        },
                    },
                    create: {
                        tenantId: this.tenantId,
                        assessmentId,
                        questionId: answer.questionId,
                        answerJson: answer.answerJson as Prisma.InputJsonValue,
                        computedPoints: answer.computedPoints,
                    },
                    update: {
                        answerJson: answer.answerJson as Prisma.InputJsonValue,
                        computedPoints: answer.computedPoints,
                    },
                });
            }
        } else if (state.phase === 'DRAFT' && state.draft !== null) {
            // Draft update: save answers + update status + lifecycle
            await db.vendorAssessment.updateMany({
                where: { id: assessmentId, tenantId: this.tenantId },
                data: {
                    status: newStatus as AssessmentStatus,
                    score: state.draft.score,
                    riskRating: state.draft.riskRating,
                    notes: state.draft.notes,
                    lifecycleVersion: state.currentVersion,
                    ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                },
            });

            // Upsert draft answers
            for (const answer of state.draft.answers) {
                await db.vendorAssessmentAnswer.upsert({
                    where: {
                        assessmentId_questionId: {
                            assessmentId,
                            questionId: answer.questionId,
                        },
                    },
                    create: {
                        tenantId: this.tenantId,
                        assessmentId,
                        questionId: answer.questionId,
                        answerJson: answer.answerJson as Prisma.InputJsonValue,
                        computedPoints: answer.computedPoints,
                    },
                    update: {
                        answerJson: answer.answerJson as Prisma.InputJsonValue,
                        computedPoints: answer.computedPoints,
                    },
                });
            }
        } else {
            // Status-only update (archive or other phase transitions)
            await db.vendorAssessment.updateMany({
                where: { id: assessmentId, tenantId: this.tenantId },
                data: {
                    status: newStatus as AssessmentStatus,
                    lifecycleVersion: state.currentVersion,
                    ...(historyJson ? { lifecycleHistoryJson: historyJson as unknown as Prisma.InputJsonValue } : {}),
                },
            });
        }
    }
}
