/**
 * Evidence DTOs — mirrors shapes returned by EvidenceRepository
 */
import { z } from '@/lib/openapi/zod';
import { UserRefShortSchema } from './common';

// ─── Evidence Review sub-shape ───

export const EvidenceReviewDTOSchema = z.object({
    id: z.string(),
    evidenceId: z.string(),
    reviewerId: z.string(),
    action: z.string(),
    comment: z.string().nullable().optional(),
    createdAt: z.string(),
    reviewer: UserRefShortSchema.nullable().optional(),
}).passthrough().openapi('EvidenceReview', {
    description: 'A single evidence-review event (submission/approval/rejection) — append-only audit row attached to the evidence record.',
});

export type EvidenceReviewDTO = z.infer<typeof EvidenceReviewDTOSchema>;

// ─── Evidence List Item ───

// EP-3 — a single evidence↔control association (the join row + its control).
export const EvidenceControlLinkDTOSchema = z.object({
    id: z.string().optional(),
    controlId: z.string(),
    createdAt: z.string().optional(),
    control: z.object({
        id: z.string(),
        name: z.string(),
        annexId: z.string().nullable().optional(),
        code: z.string().nullable().optional(),
    }).passthrough().nullable().optional(),
}).passthrough().openapi('EvidenceControlLink', {
    description: 'A single evidence↔control association. Evidence is many-to-many with controls via this join.',
});

export type EvidenceControlLinkDTO = z.infer<typeof EvidenceControlLinkDTOSchema>;

export const EvidenceListItemDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string().nullable().optional(),
    fileName: z.string().nullable().optional(),
    fileSize: z.number().nullable().optional(),
    category: z.string().nullable().optional(),
    dateCollected: z.string().optional(),
    owner: z.string().nullable().optional(),
    reviewCycle: z.string().nullable().optional(),
    nextReviewDate: z.string().nullable().optional(),
    status: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    // EP-3 — the controls this evidence satisfies (many-to-many).
    evidenceControlLinks: z.array(EvidenceControlLinkDTOSchema).optional(),
}).passthrough().openapi('EvidenceListItem', {
    description: 'Evidence record as shown in list views. content is encrypted at rest for TEXT type and decrypted transparently on read by the field-encryption middleware.',
});

export type EvidenceListItemDTO = z.infer<typeof EvidenceListItemDTOSchema>;

// ─── Evidence Detail ───

// EP-3 — "uploaded from" back-refs for the where-used list (read-only).
const EntityRefSchema = z.object({
    id: z.string(),
    key: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
}).passthrough();

export const EvidenceDetailDTOSchema = EvidenceListItemDTOSchema.extend({
    reviews: z.array(EvidenceReviewDTOSchema).optional(),
    risk: EntityRefSchema.nullable().optional(),
    asset: EntityRefSchema.nullable().optional(),
    task: EntityRefSchema.nullable().optional(),
}).passthrough().openapi('EvidenceDetail', {
    description: 'Evidence record with the full review history + where-used associations attached. Returned by GET /evidence/{id}.',
});

export type EvidenceDetailDTO = z.infer<typeof EvidenceDetailDTOSchema>;
