import { z } from 'zod';

/**
 * NIS2 gap-assessment lifecycle — apply (propose-not-commit) payload validation.
 * The client sends the subset of proposed remediations the user approved; the
 * usecase re-derives the current suggestions and only acts on genuine ones, so
 * this schema is a shape/authorization gate, not the source of truth.
 */
export const RemediationKindSchema = z.enum(['RISK', 'CONTROL_LINK', 'CONTROL_CREATE', 'TASK']);

export const RemediationApprovalSchema = z.object({
    questionId: z.string().min(1).max(64),
    kind: RemediationKindSchema,
    /** Required only for CONTROL_LINK — the existing control to bind the task to. */
    linkControlId: z.string().min(1).max(64).optional(),
});

export const ApplyRemediationsSchema = z.object({
    approvals: z.array(RemediationApprovalSchema).max(200),
});

export const MinCriticalitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type ApplyRemediationsInput = z.infer<typeof ApplyRemediationsSchema>;
