/**
 * Inbound-questionnaire AI — Stub Provider (PR-9).
 *
 * Deterministic, grounded, cited draft generation for development/testing AND
 * as the zero-config fallback. Ranks the tenant's grounding snippets by
 * keyword overlap with the question, drafts a cited answer from the best
 * matches, and reports a confidence derived from the match strength. NEVER
 * fabricates beyond the provided grounding — a no-match question gets a low
 * confidence so the usecase FLAGS it for a human.
 */
import type { QuestionnaireDraftInput, QuestionnaireDraftOutput, QuestionnaireProvider } from './types';
import { relevance } from './types';

export class StubQuestionnaireProvider implements QuestionnaireProvider {
    readonly providerName = 'stub';

    async draftAnswer(input: QuestionnaireDraftInput): Promise<QuestionnaireDraftOutput> {
        const ranked = input.grounding
            .map((g) => ({ g, score: relevance(input.question, `${g.label} ${g.text}`) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        if (ranked.length === 0) {
            return {
                answer: 'We do not have a documented control or policy that directly answers this question. A subject-matter expert should review and respond.',
                confidence: 0.1,
                citations: [],
            };
        }

        const top = ranked[0];
        const citations = ranked.map((r) => ({ kind: r.g.kind, id: r.g.id, label: r.g.label }));
        // H4 — a single keyword overlap must NOT clear the 0.4 auto-DRAFT floor
        // (it previously did: 0.35 + score*0.6). Require substantial overlap
        // before the answer is auto-drafted rather than flagged for a human.
        const confidence = Math.min(0.85, 0.15 + top.score * 0.7);
        const basis = ranked.map((r) => r.g.label).join('; ');
        // H4 — do NOT lead with an affirmative "Yes." (a false-affirmative
        // security answer). Phrase neutrally and let the human confirm.
        const answer = `Our ${top.g.kind.toLowerCase()} "${top.g.label}" is relevant: ${top.g.text.slice(0, 400)}${top.g.text.length > 400 ? '…' : ''} (see also: ${basis}). Please verify before submitting.`;

        return { answer, confidence, citations };
    }
}
