/**
 * Inbound-questionnaire AI (PR-9) — provider abstraction so the backend can be
 * swapped (stub / OpenRouter). Mirrors the risk-assessment provider shape.
 */

/** A grounding snippet from the tenant's approved compliance content. */
export interface GroundingSnippet {
    kind: 'CONTROL' | 'POLICY' | 'EVIDENCE';
    id: string;
    label: string;
    text: string;
}

export interface QuestionnaireDraftInput {
    question: string;
    grounding: GroundingSnippet[];
}

export interface QuestionnaireCitation {
    kind: string;
    id: string;
    label: string;
}

export interface QuestionnaireDraftOutput {
    answer: string;
    /** 0..1. Below the usecase threshold → the item is FLAGGED, never auto-answered. */
    confidence: number;
    citations: QuestionnaireCitation[];
}

export interface QuestionnaireProvider {
    readonly providerName: string;
    draftAnswer(input: QuestionnaireDraftInput): Promise<QuestionnaireDraftOutput>;
}

// ─── Shared grounding relevance (used by the stub + the retrieval step) ───

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'does', 'you', 'your', 'have', 'has', 'we', 'our', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'that', 'this', 'how', 'what', 'please', 'describe']);

export function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Keyword-overlap relevance of a snippet to a question, 0..1. */
export function relevance(question: string, snippetText: string): number {
    const q = new Set(tokenize(question));
    if (q.size === 0) return 0;
    const s = new Set(tokenize(snippetText));
    let hits = 0;
    for (const w of q) if (s.has(w)) hits += 1;
    return hits / q.size;
}
