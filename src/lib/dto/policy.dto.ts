/**
 * Policy DTOs — mirrors shapes returned by PolicyRepository.list() and .getById()
 */
import { z } from '@/lib/openapi/zod';
import { UserRefSchema, UserRefShortSchema } from './common';

// ─── Policy Version sub-shape ───

export const PolicyVersionDTOSchema = z.object({
    id: z.string(),
    policyId: z.string(),
    versionNumber: z.number(),
    contentType: z.string(),
    contentText: z.string().nullable().optional(),
    externalUrl: z.string().nullable().optional(),
    changeSummary: z.string().nullable().optional(),
    createdAt: z.string(),
    createdBy: UserRefShortSchema.nullable().optional(),
    approvals: z.array(z.object({
        id: z.string(),
        status: z.string(),
        policyVersionId: z.string().optional(),
        requestedBy: UserRefShortSchema.nullable().optional(),
        approvedBy: UserRefShortSchema.nullable().optional(),
        decidedAt: z.string().nullable().optional(),
        comment: z.string().nullable().optional(),
    }).passthrough()).optional(),
}).passthrough();
export type PolicyVersionDTO = z.infer<typeof PolicyVersionDTOSchema>;

// ─── Policy Control Link ───

export const PolicyControlLinkDTOSchema = z.object({
    id: z.string(),
    control: z.object({
        id: z.string(),
        name: z.string(),
        annexId: z.string().nullable().optional(),
    }).passthrough(),
}).passthrough();
export type PolicyControlLinkDTO = z.infer<typeof PolicyControlLinkDTOSchema>;

// ─── Policy Evidence-to-Retain checklist item ───

export const PolicyEvidenceItemDTOSchema = z.object({
    id: z.string(),
    label: z.string(),
    sortOrder: z.number().optional(),
    evidenceId: z.string().nullable().optional(),
    evidence: z.object({
        id: z.string(),
        title: z.string(),
        type: z.string().nullable().optional(),
        retentionUntil: z.string().nullable().optional(),
    }).passthrough().nullable().optional(),
}).passthrough();
export type PolicyEvidenceItemDTO = z.infer<typeof PolicyEvidenceItemDTOSchema>;

// ─── Policy List Item ───
// Returned by PolicyRepository.list()

export const PolicyListItemDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    status: z.string(),
    ownerUserId: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    reviewFrequencyDays: z.number().nullable().optional(),
    nextReviewAt: z.string().nullable().optional(),
    lastReviewedAt: z.string().nullable().optional(),
    currentVersionId: z.string().nullable().optional(),
    lifecycleVersion: z.number().optional(),
    // Prior published snapshots (Prompt-3.1) — rollback targets.
    lifecycleHistoryJson: z.array(z.object({
        versionId: z.string(),
        versionNumber: z.number(),
        supersededAt: z.string().optional(),
    }).passthrough()).nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    currentVersion: PolicyVersionDTOSchema.nullable().optional(),
    owner: UserRefSchema.nullable().optional(),
    // Per-policy acknowledgement rollup for the CURRENT published version
    // (annotatePolicyAcknowledgements). `outstanding` is true when a
    // published policy has ≥1 assignee who has not acknowledged the
    // current version — drives the library KPI / column / filter.
    acknowledgement: z.object({
        assignedCount: z.number(),
        acknowledgedCount: z.number(),
        outstanding: z.boolean(),
    }).optional(),
    _count: z.object({
        versions: z.number().optional(),
        controlLinks: z.number().optional(),
        approvals: z.number().optional(),
    }).optional(),
}).passthrough().openapi('PolicyListItem', {
    description: 'Policy as it appears in list views — includes the currently published version, owner, and aggregate counts. The detail endpoint adds full version history + control links.',
});

export type PolicyListItemDTO = z.infer<typeof PolicyListItemDTOSchema>;

// ─── Policy Detail ───
// Returned by PolicyRepository.getById()

export const PolicyDetailDTOSchema = PolicyListItemDTOSchema.extend({
    versions: z.array(PolicyVersionDTOSchema).optional(),
    controlLinks: z.array(PolicyControlLinkDTOSchema).optional(),
    evidenceItems: z.array(PolicyEvidenceItemDTOSchema).optional(),
    approvals: z.array(z.object({
        id: z.string(),
        status: z.string(),
        policyVersionId: z.string().optional(),
        policyId: z.string().optional(),
        requestedBy: UserRefShortSchema.nullable().optional(),
        approvedBy: UserRefShortSchema.nullable().optional(),
        decidedAt: z.string().nullable().optional(),
        // The reviewer's decision comment. It was always in the payload but
        // undeclared, so the detail page read it through a cast.
        comment: z.string().nullable().optional(),
    }).passthrough()).optional(),
}).openapi('PolicyDetail', {
    description: 'Policy with full version history, control links, and approval audit trail. Returned by GET /policies/{id}.',
});

export type PolicyDetailDTO = z.infer<typeof PolicyDetailDTOSchema>;
