/**
 * AI Compliance-Posture Summary — Output Safety Gate.
 *
 * Runs at the usecase boundary AFTER any provider returns, so it applies
 * uniformly to the stub AND every LLM provider and the cleaned result is what
 * gets PERSISTED (defence at the storage layer, mirroring risk-assessment's
 * output-guard + Epic C.5). Pure + side-effect-free → exhaustively testable.
 *
 * Guarantees on the returned result:
 *   - postureLabel is one of the known bands (clamped from score if invalid);
 *   - maturityScore is an integer in [0, 100] or null;
 *   - advice is ≤ MAX_ADVICE items, each with a valid priority;
 *   - every free-text field is stripped of HTML / scripts via sanitizePlainText.
 */
import { sanitizePlainText } from '@/lib/security/sanitize';
import {
    POSTURE_LABELS,
    type AdvicePriority,
    type PostureAdviceItem,
    type PostureLabel,
    type PostureSummaryResult,
} from './types';
import { scoreToPostureLabel } from './stub-provider';

export const MAX_ADVICE = 5;

const VALID_PRIORITIES: readonly AdvicePriority[] = ['high', 'medium', 'low'];

function clampScore(value: number | null | undefined): number | null {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function clampLabel(label: string | undefined, score: number | null): PostureLabel {
    if (label && (POSTURE_LABELS as readonly string[]).includes(label)) {
        return label as PostureLabel;
    }
    // Fall back to deriving the band from the score (or the weakest band).
    return scoreToPostureLabel(score ?? 0);
}

function clampPriority(priority: string | undefined): AdvicePriority {
    return priority && (VALID_PRIORITIES as readonly string[]).includes(priority)
        ? (priority as AdvicePriority)
        : 'medium';
}

function cleanAdvice(advice: PostureAdviceItem[] | undefined): PostureAdviceItem[] {
    if (!Array.isArray(advice)) return [];
    return advice
        .slice(0, MAX_ADVICE)
        .map((a) => ({
            title: sanitizePlainText(a?.title).slice(0, 120),
            detail: sanitizePlainText(a?.detail).slice(0, 400),
            priority: clampPriority(a?.priority),
        }))
        .filter((a) => a.title.length > 0);
}

/**
 * Apply the output guard to a provider result. Returns a result safe to
 * persist + render.
 */
export function applyPostureOutputGuard(result: PostureSummaryResult): PostureSummaryResult {
    const maturityScore = clampScore(result.maturityScore);
    return {
        ...result,
        maturityScore,
        postureLabel: clampLabel(result.postureLabel, maturityScore),
        summaryText: sanitizePlainText(result.summaryText).slice(0, 1200),
        advice: cleanAdvice(result.advice),
    };
}
