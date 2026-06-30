/**
 * AI Risk Assessment — Output Safety Gate (AISVS L2).
 *
 * Runs AFTER `RiskSuggestionOutputSchema` shape-validation, at the usecase
 * boundary, so it applies uniformly to EVERY provider (OpenRouter + the
 * deterministic stub) and the cleaned text is what gets PERSISTED — defence
 * at the storage layer, not just at render (mirrors IC's Epic C.5 rule).
 *
 * Closes three AISVS v1.0 L2 requirements for the applicable surface:
 *
 *   - **C7.3.2 / C5.2.4** — filter the system prompt + internal/instruction
 *     content out of model output. A model that echoes "[BEGIN UNTRUSTED
 *     TENANT DATA]", the Trust-Boundary directive, or "ignore previous
 *     instructions" into a suggestion field has its leak redacted, so the
 *     prompt internals never reach the UI / PDF / audit-pack reader.
 *   - **C7.3.3** — prevent outputs from triggering outbound requests. URLs,
 *     markdown images/links, and HTML are stripped from every free-text
 *     field so a rendered suggestion can't auto-load a remote resource
 *     (tracking pixel, SSRF-via-render, data exfil).
 *   - **C7.2.2** — block low-confidence answers. Suggestions below the
 *     confidence floor are dropped from the surfaced set rather than
 *     presented as if reliable (C7.2.1 confidence scoring is already met).
 *
 * Pure + side-effect-free so it is exhaustively unit-testable; the caller
 * records the redaction/drop counts as a safety signal.
 */
import type { ConfidenceLevel, RiskSuggestion, RiskSuggestionOutput } from './types';

// Block anything strictly below this confidence (C7.2.2). 'low' is blocked by
// default; 'medium' and 'high' pass. A future tenant-tunable floor would read
// from config here.
export const MIN_CONFIDENCE: ConfidenceLevel = 'medium';

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
};

// Signatures that indicate the model leaked the system prompt / instruction
// hierarchy into its output. Matched case-insensitively + globally against
// every free-text output field (C7.3.2 / C5.2.4). All carry the `g` flag so a
// single field can be fully scrubbed of repeated leaks.
const SYSTEM_LEAK_PATTERNS: RegExp[] = [
    /\[\s*(?:begin|end)\s+untrusted[^\]]*\]/gi, // forged / echoed trust-boundary markers
    /trust boundary/gi,
    /you are an expert grc/gi,
    /your only instructions/gi,
    /\bsystem (?:prompt|message)\b/gi,
    /ignore (?:all |any |the )?(?:previous|prior|above) instructions/gi,
];

const REDACTED = '[redacted]';

/**
 * Strip anything from a free-text field that could trigger an outbound
 * request when the suggestion is rendered (C7.3.3). Markdown link TEXT is
 * preserved (the destination is dropped); images, HTML, and bare URLs are
 * removed entirely.
 */
export function stripOutboundContent(value: string): string {
    return value
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // markdown image — drop entirely
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown link — keep text, drop href
        .replace(/<[^>]+>/g, '') // any HTML tag
        .replace(/\bhttps?:\/\/\S+/gi, '[link removed]') // bare http(s) URL
        .replace(/\bwww\.[^\s]+/gi, '[link removed]') // bare www URL
        .replace(/\bdata:[^\s]+/gi, '[data removed]') // data: URIs
        .trim();
}

/**
 * Redact system-prompt / instruction leakage from a single field
 * (C7.3.2 / C5.2.4). Returns the cleaned text + whether anything was redacted.
 */
function redactLeaks(value: string): { text: string; redacted: boolean } {
    let out = value;
    let redacted = false;
    for (const re of SYSTEM_LEAK_PATTERNS) {
        // Reset lastIndex — these are module-level `g` regexes reused across calls.
        re.lastIndex = 0;
        if (re.test(out)) {
            redacted = true;
            re.lastIndex = 0;
            out = out.replace(re, REDACTED);
        }
    }
    return { text: redacted ? out.trim() : out, redacted };
}

/** Clean one free-text field: strip outbound content, then redact leaks. */
function cleanField(value: string, counters: { redactions: number }): string {
    const stripped = stripOutboundContent(value);
    const { text, redacted } = redactLeaks(stripped);
    if (redacted) counters.redactions += 1;
    return text;
}

export interface OutputGuardResult {
    /** Cleaned + confidence-filtered suggestions, safe to persist + render. */
    suggestions: RiskSuggestion[];
    /** Count of fields that had a system-prompt/instruction leak redacted. */
    redactions: number;
    /** Count of suggestions dropped for being below the confidence floor. */
    droppedLowConfidence: number;
}

/**
 * Apply the output safety gate to a validated provider output. The returned
 * `suggestions` are what the caller should persist + surface.
 */
export function applyOutputGuard(
    output: RiskSuggestionOutput,
    minConfidence: ConfidenceLevel = MIN_CONFIDENCE,
): OutputGuardResult {
    const counters = { redactions: 0 };
    let droppedLowConfidence = 0;
    const floor = CONFIDENCE_RANK[minConfidence];

    const suggestions: RiskSuggestion[] = [];
    for (const s of output.suggestions) {
        // C7.2.2 — block below-floor confidence from the surfaced set.
        if (CONFIDENCE_RANK[s.confidence] < floor) {
            droppedLowConfidence += 1;
            continue;
        }
        suggestions.push({
            ...s,
            title: cleanField(s.title, counters),
            description: cleanField(s.description, counters),
            category: s.category ? cleanField(s.category, counters) : s.category,
            threat: s.threat ? cleanField(s.threat, counters) : s.threat,
            vulnerability: s.vulnerability ? cleanField(s.vulnerability, counters) : s.vulnerability,
            rationale: cleanField(s.rationale, counters),
            relatedAssetName: s.relatedAssetName
                ? cleanField(s.relatedAssetName, counters)
                : s.relatedAssetName,
            suggestedControls: s.suggestedControls.map((c) => cleanField(c, counters)),
            structuredRationale: {
                whyThisRisk: cleanField(s.structuredRationale.whyThisRisk, counters),
                affectedAssetCharacteristics:
                    s.structuredRationale.affectedAssetCharacteristics.map((c) =>
                        cleanField(c, counters),
                    ),
                suggestedControlThemes: s.structuredRationale.suggestedControlThemes.map((c) =>
                    cleanField(c, counters),
                ),
            },
        });
    }

    return { suggestions, redactions: counters.redactions, droppedLowConfidence };
}
