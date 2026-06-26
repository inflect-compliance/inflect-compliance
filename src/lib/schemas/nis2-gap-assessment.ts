/**
 * NIS2 gap-assessment question set — Zod schema.
 *
 * Mirrors the upstream open-data shape (NISD2/nis2-gap-assessment-schema,
 * content licensed CC BY 4.0) but with OUR string enums instead of the
 * source's integer codes — so the rest of the codebase never deals with
 * `criticality: 3` magic numbers. The sync script
 * (`scripts/sync-nis2-gap-assessment.ts`) translates the upstream integers
 * to these strings at ingest time and validates the result against this
 * schema before writing the pinned fixture.
 *
 * Attribution: "Based on the NIS2 Gap Assessment by Kardashev Catalyst UG /
 * nisd2.eu, licensed under CC BY 4.0." — see
 * prisma/fixtures/nis2-gap-assessment.LICENSE.md.
 */
import { z } from 'zod';

export const NIS2_CRITICALITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const NIS2_RESPONDENT = ['CEO', 'IT', 'HR', 'PROCUREMENT', 'ANYONE'] as const;
export const NIS2_CONSEQUENCE = ['AUDIT_FINDING', 'OPERATIONAL_RISK', 'FINE', 'PERSONAL_LIABILITY'] as const;
export const NIS2_TIME_TO_FIX = ['QUICK_WIN', 'DAYS', 'WEEKS', 'MONTHS'] as const;
export const NIS2_ANSWER = ['NA', 'NO', 'PARTIALLY', 'YES'] as const;

/** Index → string maps for translating the upstream integer enums at ingest. */
export const NIS2_CRITICALITY_BY_INDEX = NIS2_CRITICALITY;
export const NIS2_RESPONDENT_BY_INDEX = NIS2_RESPONDENT;
export const NIS2_CONSEQUENCE_BY_INDEX = NIS2_CONSEQUENCE;
export const NIS2_TIME_TO_FIX_BY_INDEX = NIS2_TIME_TO_FIX;
/** Upstream answer enum: NA=-1, NO=0, PARTIALLY=1, YES=2 (offset by +1). */
export const NIS2_ANSWER_BY_OFFSET_INDEX = NIS2_ANSWER;

const Bilingual = z.object({ en: z.string(), de: z.string() });

export const Nis2GapDomainSchema = z.object({
    id: z.number().int().min(0).max(14),
    code: z.string(),
    name: Bilingual,
    description: Bilingual,
    day: z.number().int().min(1).max(5),
});

export const Nis2GapQuestionSchema = z.object({
    id: z.string().min(1),
    domain: z.number().int().min(0).max(14),
    text: Bilingual,
    plainText: Bilingual,
    legalBasis: z.string(),
    criticality: z.enum(NIS2_CRITICALITY),
    respondent: z.enum(NIS2_RESPONDENT),
    consequence: z.enum(NIS2_CONSEQUENCE),
    fineExposure: z.boolean(),
    timeToFix: z.enum(NIS2_TIME_TO_FIX),
    day: z.number().int().min(1).max(5),
    dependsOn: z.array(z.string()),
});

export const Nis2GapAssessmentSchema = z.object({
    version: z.string().min(1),
    lastUpdated: z.string().min(1),
    /** Provenance — stamped by the sync script. */
    source: z.string().url(),
    license: z.string(),
    attribution: z.string(),
    importedAt: z.string(),
    domains: z.array(Nis2GapDomainSchema).min(1),
    questions: z.array(Nis2GapQuestionSchema).min(1),
});

export type Nis2GapDomain = z.infer<typeof Nis2GapDomainSchema>;
export type Nis2GapQuestion = z.infer<typeof Nis2GapQuestionSchema>;
export type Nis2GapAssessment = z.infer<typeof Nis2GapAssessmentSchema>;
