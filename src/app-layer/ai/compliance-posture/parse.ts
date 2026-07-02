/**
 * AI Compliance-Posture Summary — defensive LLM-response parser.
 *
 * Shared by the Anthropic + OpenRouter providers. Extracts a JSON object from
 * the model's text (tolerating ```json fences and surrounding prose), then
 * maps it into a PostureSummaryResult. Missing/invalid fields are back-filled
 * from the deterministic computation so a partially-conformant response still
 * yields a usable result; a completely unparseable response throws so the
 * caller falls back to the full deterministic summary. Final clamping is the
 * output-guard's job — this parser is lenient by design.
 */
import type { PostureAdviceItem, PostureSummaryInput, PostureSummaryResult } from './types';
import { POSTURE_LABELS } from './types';
import { derivePostureScore, scoreToPostureLabel } from './stub-provider';

/** Pull the first balanced JSON object out of arbitrary model text. */
function extractJson(text: string): unknown {
    const trimmed = text.trim();
    // Strip a ```json ... ``` (or bare ```) fence if present.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : trimmed;
    try {
        return JSON.parse(candidate);
    } catch {
        // Last resort: grab from the first `{` to the last `}`.
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1));
        }
        throw new Error('No parseable JSON object in model response');
    }
}

function coerceAdvice(raw: unknown): PostureAdviceItem[] {
    if (!Array.isArray(raw)) return [];
    const out: PostureAdviceItem[] = [];
    for (const item of raw) {
        if (item && typeof item === 'object') {
            const r = item as Record<string, unknown>;
            const title = typeof r.title === 'string' ? r.title : '';
            if (!title) continue;
            const priority =
                r.priority === 'high' || r.priority === 'medium' || r.priority === 'low'
                    ? r.priority
                    : 'medium';
            out.push({
                title,
                detail: typeof r.detail === 'string' ? r.detail : '',
                priority,
            });
        }
    }
    return out;
}

export function parsePostureJson(
    text: string,
    input: PostureSummaryInput,
    meta: { provider: string; model: string },
): PostureSummaryResult {
    const parsed = extractJson(text) as Record<string, unknown>;

    const derivedScore = derivePostureScore(input);
    const rawScore = parsed.maturityScore;
    const maturityScore =
        typeof rawScore === 'number' && !Number.isNaN(rawScore) ? Math.round(rawScore) : derivedScore;

    const rawLabel = parsed.postureLabel;
    const postureLabel =
        typeof rawLabel === 'string' && (POSTURE_LABELS as readonly string[]).includes(rawLabel)
            ? (rawLabel as PostureSummaryResult['postureLabel'])
            : scoreToPostureLabel(maturityScore);

    const advice = coerceAdvice(parsed.advice);
    const summaryText = typeof parsed.summaryText === 'string' ? parsed.summaryText : '';

    // A response with neither narrative nor advice is not usable — signal the
    // caller to fall back to the deterministic summary.
    if (!summaryText && advice.length === 0) {
        throw new Error('Model response missing both summaryText and advice');
    }

    return {
        postureLabel,
        maturityScore,
        summaryText,
        advice,
        provider: meta.provider,
        model: meta.model,
        isFallback: false,
    };
}
