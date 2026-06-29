/**
 * AI-governance self-assessment — the 3-way coverage readout.
 *
 * THE differentiator: one 30-question assessment, three coverage percentages.
 * Each answer is projected onto EVERY standard the question maps to (AISVS
 * chapters / ISO 42001 clauses / EU AI Act articles), so a single "Yes" counts
 * toward all standards it implicates — "one assessment, three readouts".
 *
 * Scoring: YES = 1, PARTIALLY = 0.5, NO = 0, NA = excluded. Each question is
 * weighted by criticality (CRITICAL = 4, HIGH = 3, MEDIUM = 2).
 *
 * License note: this module handles only IDs/answers — no standard prose.
 */

export type AiGovAnswerValue = 'NA' | 'NO' | 'PARTIALLY' | 'YES';
export type AiGovCriticality = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface AiGovMappings {
    aisvs: string[];
    iso42001: string[];
    euAiAct: string[];
}

export interface AiGovScoredQuestion {
    id: string;
    domainId: number;
    criticality: AiGovCriticality;
    mappings: AiGovMappings;
    /** The tenant's answer, or null when unanswered. */
    answer: AiGovAnswerValue | null;
}

export interface CoverageCell {
    /** Sum of criticality weights of applicable (non-NA, answered) questions. */
    applicableWeight: number;
    /** weighted (YES=1, PARTIALLY=0.5) / applicableWeight, 0-100; null if none. */
    percent: number | null;
}

export interface AiGovCoverageReadout {
    aisvs: CoverageCell;
    iso42001: CoverageCell;
    euAiAct: CoverageCell;
    overall: CoverageCell;
    byDomain: Array<{ domainId: number; percent: number | null }>;
    /** CRITICAL questions answered NO/PARTIALLY — the legal-exposure flags. */
    criticalGaps: string[];
    /** Questions answered (non-null) — for progress display. */
    answered: number;
    total: number;
}

const CRIT_WEIGHT: Record<AiGovCriticality, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2 };
const ANSWER_CREDIT: Record<Exclude<AiGovAnswerValue, 'NA'>, number> = { YES: 1, PARTIALLY: 0.5, NO: 0 };

function emptyCell(): { applicableWeight: number; creditedWeight: number } {
    return { applicableWeight: 0, creditedWeight: 0 };
}
function finalize(c: { applicableWeight: number; creditedWeight: number }): CoverageCell {
    return {
        applicableWeight: c.applicableWeight,
        percent: c.applicableWeight > 0 ? Math.round((c.creditedWeight / c.applicableWeight) * 100) : null,
    };
}

/**
 * Compute the 3-way coverage readout from the scored questions. NA / unanswered
 * questions are excluded from every denominator they would otherwise enter.
 */
export function computeAiGovCoverage(questions: AiGovScoredQuestion[]): AiGovCoverageReadout {
    const aisvs = emptyCell();
    const iso = emptyCell();
    const eu = emptyCell();
    const overall = emptyCell();
    const domains = new Map<number, { applicableWeight: number; creditedWeight: number }>();
    const criticalGaps: string[] = [];
    let answered = 0;

    for (const q of questions) {
        if (q.answer != null) answered++;
        if (q.answer == null || q.answer === 'NA') continue; // excluded

        const weight = CRIT_WEIGHT[q.criticality];
        const credit = ANSWER_CREDIT[q.answer] * weight;

        // Critical-gap flagging (legal-exposure questions).
        if (q.criticality === 'CRITICAL' && (q.answer === 'NO' || q.answer === 'PARTIALLY')) {
            criticalGaps.push(q.id);
        }

        // Project onto every standard the question maps to.
        if (q.mappings.aisvs.length > 0) { aisvs.applicableWeight += weight; aisvs.creditedWeight += credit; }
        if (q.mappings.iso42001.length > 0) { iso.applicableWeight += weight; iso.creditedWeight += credit; }
        if (q.mappings.euAiAct.length > 0) { eu.applicableWeight += weight; eu.creditedWeight += credit; }

        overall.applicableWeight += weight;
        overall.creditedWeight += credit;

        const d = domains.get(q.domainId) ?? emptyCell();
        d.applicableWeight += weight;
        d.creditedWeight += credit;
        domains.set(q.domainId, d);
    }

    return {
        aisvs: finalize(aisvs),
        iso42001: finalize(iso),
        euAiAct: finalize(eu),
        overall: finalize(overall),
        byDomain: [...domains.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([domainId, c]) => ({ domainId, percent: finalize(c).percent })),
        criticalGaps,
        answered,
        total: questions.length,
    };
}
