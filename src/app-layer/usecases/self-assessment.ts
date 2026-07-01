/**
 * Getting-started self-assessment usecases.
 *
 * Registers the embedded posture assessments (today: Digital Sovereignty) and
 * owns the ONE path that turns a below-threshold dimension into real records:
 * `materializeSelfAssessmentSuggestions`. Scoring + suggestion-building live in
 * the pure `@/lib/self-assessments/scoring` module (propose); this usecase
 * commits — and ONLY on explicit, per-dimension user approval, via the existing
 * `createRisk` / `createControl` usecases (each hash-chain audited).
 *
 * A self-assessment aid, NOT legal advice.
 */
import type { RequestContext } from '@/app-layer/types';
import { assertCanWrite } from '@/app-layer/policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest } from '@/lib/errors/types';
import { createRisk } from './risk';
import { createControl } from './control/mutations';
import {
    scoreSelfAssessment,
    buildGapSuggestions,
    type SelfAssessmentAnswers,
} from '@/lib/self-assessments/scoring';
import {
    MaterializeSelfAssessmentSchema,
    type MaterializeSelfAssessmentInput,
    type SelfAssessmentKey,
} from '@/app-layer/schemas/self-assessment';
import {
    DIGITAL_SOVEREIGNTY_ASSESSMENT,
    type SelfAssessment,
} from '@/data/self-assessments/digital-sovereignty';

/** The embedded getting-started self-assessments, keyed by assessment key. */
export const SELF_ASSESSMENTS: Record<SelfAssessmentKey, SelfAssessment> = {
    'digital-sovereignty': DIGITAL_SOVEREIGNTY_ASSESSMENT,
};

/** Idempotency category — materialised records carry this so re-runs dedupe. */
export const SELF_ASSESSMENT_CATEGORY = 'Digital Sovereignty';

export function getSelfAssessment(key: SelfAssessmentKey): SelfAssessment {
    const a = SELF_ASSESSMENTS[key];
    if (!a) throw badRequest(`Unknown self-assessment '${key}'.`);
    return a;
}

/** Score an assessment server-side (the UI also scores client-side via the same pure module). */
export function scoreSelfAssessmentByKey(key: SelfAssessmentKey, answers: SelfAssessmentAnswers) {
    const assessment = getSelfAssessment(key);
    const score = scoreSelfAssessment(assessment, answers);
    return { score, suggestions: buildGapSuggestions(assessment, score) };
}

export interface MaterializeResult {
    createdRiskIds: string[];
    createdControlIds: string[];
    skipped: number;
}

/**
 * Materialise the APPROVED gap suggestions into real risks + controls. The
 * server re-scores from the submitted answers, keeps only approved dimensions
 * that are genuinely below the gap threshold, and dedupes idempotently by
 * (category, title/name) so re-running never double-creates. Nothing is written
 * for a dimension the user did not approve.
 */
export async function materializeSelfAssessmentSuggestions(
    ctx: RequestContext,
    rawInput: MaterializeSelfAssessmentInput,
): Promise<MaterializeResult> {
    assertCanWrite(ctx);
    const input = MaterializeSelfAssessmentSchema.parse(rawInput);
    const assessment = getSelfAssessment(input.key);

    const score = scoreSelfAssessment(assessment, input.answers);
    const suggestions = buildGapSuggestions(assessment, score);
    const suggestionByDim = new Map(suggestions.map((s) => [s.dimensionId, s]));

    // Keep only approvals that (a) map to a real gap suggestion and (b) opt into
    // at least one of risk/control.
    const approved = input.approvals.filter((a) => suggestionByDim.has(a.dimensionId) && (a.createRisk || a.createControl));
    if (approved.length === 0) {
        return { createdRiskIds: [], createdControlIds: [], skipped: 0 };
    }

    // Idempotency: gather already-materialised risk titles + control names in
    // this assessment's category so a re-run skips them.
    const { existingRiskTitles, existingControlNames } = await runInTenantContext(ctx, async (db) => {
        const [risks, controls] = await Promise.all([
            db.risk.findMany({ where: { tenantId: ctx.tenantId, category: SELF_ASSESSMENT_CATEGORY }, select: { title: true }, take: 2000 }),
            db.control.findMany({ where: { tenantId: ctx.tenantId, category: SELF_ASSESSMENT_CATEGORY }, select: { name: true }, take: 2000 }),
        ]);
        return {
            existingRiskTitles: new Set(risks.map((r) => r.title)),
            existingControlNames: new Set(controls.map((c) => c.name)),
        };
    });

    const createdRiskIds: string[] = [];
    const createdControlIds: string[] = [];
    let skipped = 0;

    for (const approval of approved) {
        const s = suggestionByDim.get(approval.dimensionId)!;
        if (approval.createRisk) {
            if (existingRiskTitles.has(s.riskTitle)) {
                skipped++;
            } else {
                const risk = await createRisk(ctx, {
                    title: s.riskTitle,
                    description: `Self-assessed digital-sovereignty gap (${s.clauseRef}). Source: Digital Sovereignty Posture self-assessment (self-reported, not legal advice).`,
                    category: SELF_ASSESSMENT_CATEGORY,
                });
                createdRiskIds.push(risk.id);
                existingRiskTitles.add(s.riskTitle);
            }
        }
        if (approval.createControl) {
            if (existingControlNames.has(s.controlName)) {
                skipped++;
            } else {
                const control = await createControl(ctx, {
                    name: s.controlName,
                    description: `Suggested from the Digital Sovereignty Posture self-assessment (${s.clauseRef}). Not legal advice.`,
                    category: SELF_ASSESSMENT_CATEGORY,
                    isCustom: true,
                });
                createdControlIds.push(control.id);
                existingControlNames.add(s.controlName);
            }
        }
    }

    return { createdRiskIds, createdControlIds, skipped };
}
