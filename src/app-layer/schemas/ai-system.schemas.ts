/**
 * Zod schemas for the EU AI Act AI-System Registry.
 *
 * The create schema captures the registry metadata PLUS the short
 * classification questionnaire (answers authored from Art 5 / Annex III /
 * Art 50 — see src/lib/eu-ai-act/classification.ts). The usecase runs the
 * deterministic classifier over these answers; the tier is never accepted
 * from the client.
 */
import { z } from 'zod';
import {
    ART5_PROHIBITED_PRACTICES,
    ANNEX_III_AREAS,
    ART50_TRANSPARENCY_CASES,
} from '@/lib/eu-ai-act/classification';

const art5Ids = ART5_PROHIBITED_PRACTICES.map((o) => o.id) as [string, ...string[]];
const annexIIIIds = ANNEX_III_AREAS.map((o) => o.id) as [string, ...string[]];
const art50Ids = ART50_TRANSPARENCY_CASES.map((o) => o.id) as [string, ...string[]];

/** The classification questionnaire answers. All optional/nullable. */
export const ClassificationAnswersSchema = z.object({
    prohibitedPractice: z.enum(art5Ids).optional().nullable(),
    isAnnexIProductSafetyComponent: z.boolean().optional().nullable(),
    annexIIIArea: z.enum(annexIIIIds).optional().nullable(),
    transparencyCase: z.enum(art50Ids).optional().nullable(),
});

export const CreateAiSystemSchema = z.object({
    name: z.string().min(2, 'Name is required').max(200).trim(),
    purpose: z.string().max(4000).optional().nullable(),
    useContext: z.string().max(4000).optional().nullable(),
    provider: z.string().max(200).optional().nullable(),
    deploymentRole: z.enum(['PROVIDER', 'DEPLOYER']).default('DEPLOYER'),
    ownerUserId: z.string().optional().nullable(),
    classification: ClassificationAnswersSchema.default({}),
});
export type CreateAiSystemInput = z.infer<typeof CreateAiSystemSchema>;

export const GenerateConformityDraftSchema = z.object({
    docType: z.enum(['ANNEX_IV_TECHNICAL_DOCUMENTATION', 'ART_9_RISK_MANAGEMENT', 'ANNEX_V_DECLARATION_OF_CONFORMITY']),
});
export type GenerateConformityDraftInput = z.infer<typeof GenerateConformityDraftSchema>;
