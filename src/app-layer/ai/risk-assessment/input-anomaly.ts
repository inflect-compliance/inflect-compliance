/**
 * AI Risk Assessment — input anomaly detection (AISVS L2).
 *
 * A lightweight, pure detector that screens the (already privacy-sanitized)
 * tenant input for prompt-injection / adversarial signals BEFORE it is built
 * into a prompt. It does NOT block generation — the instruction/data trust
 * boundary (C2) + the reserved-token neutralizer (C2.1.7) already contain the
 * attack — but it surfaces the attempt for monitoring + human review:
 *
 *   - **C11.4.1** — pass untrusted inputs through anomaly detection.
 *   - **C11.4.2** — gate actions on flagged anomalies. The AI output is
 *     advisory (a human applies it), so the "gate" is a `reviewRecommended`
 *     flag on the resulting draft — the human is the action gate.
 *   - **C12.2.2 / C12.2.3 / C12.2.4** — identify unusual / probing patterns
 *     with AI-specific rules, and carry the offending field + kind + a short
 *     snippet as alert metadata (emitted as an `AI_RISK_INPUT_ANOMALY` audit
 *     event by the usecase).
 *
 * Pure + side-effect free so it is exhaustively unit-testable.
 */
import type { RiskAssessmentInput } from './types';

export type AnomalyKind =
    | 'injection_phrase'
    | 'reserved_token'
    | 'role_override'
    | 'excessive_specials';

export interface InputAnomaly {
    /** Where it was found — e.g. 'tenantContext', 'asset.name', 'framework'. */
    field: string;
    kind: AnomalyKind;
    /** Short (≤40 char) excerpt of the offending text for forensics. */
    snippet: string;
}

export interface AnomalyReport {
    anomalies: InputAnomaly[];
    /** True when any anomaly was detected — drives the review flag + audit. */
    flagged: boolean;
}

const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(?:all|any|the|your)?\s*(?:previous|prior|above)?\s*instructions/i,
    /disregard\s+(?:the\s+)?(?:rules|instructions|above|prior)/i,
    /reveal\s+(?:the\s+)?(?:system\s+)?prompt/i,
    /forget\s+(?:everything|the\s+above|all\s+prior)/i,
    /you\s+are\s+now\b/i,
    /\bact\s+as\b/i,
    /\bpretend\s+to\s+be\b/i,
    /new\s+instructions?\s*:/i,
];

// Reserved chat-template / role-control tokens (mirrors the prompt-builder
// neutralizer set) — their PRESENCE in tenant data is the signal.
const RESERVED_TOKEN_PATTERNS: RegExp[] = [
    /<\|[^|>]*\|>/, // ChatML
    /\[\/?INST\]/i, // Llama
    /<<\/?SYS>>/i,
    /\[\s*(?:begin|end)\s+untrusted/i, // forged trust-boundary marker
];

const ROLE_OVERRIDE_PATTERNS: RegExp[] = [
    /(?:^|\n)\s*(?:system|assistant|developer)\s*:/i,
    /\bsystem\s+prompt\b/i,
];

function snippetAround(value: string, match: RegExpMatchArray): string {
    const idx = match.index ?? 0;
    return value.slice(idx, idx + 40).trim();
}

function scanField(field: string, value: string | null | undefined): InputAnomaly[] {
    if (!value) return [];
    const found: InputAnomaly[] = [];

    for (const re of INJECTION_PATTERNS) {
        const m = value.match(re);
        if (m) {
            found.push({ field, kind: 'injection_phrase', snippet: snippetAround(value, m) });
            break; // one per kind per field is enough signal
        }
    }
    for (const re of RESERVED_TOKEN_PATTERNS) {
        const m = value.match(re);
        if (m) {
            found.push({ field, kind: 'reserved_token', snippet: snippetAround(value, m) });
            break;
        }
    }
    for (const re of ROLE_OVERRIDE_PATTERNS) {
        const m = value.match(re);
        if (m) {
            found.push({ field, kind: 'role_override', snippet: snippetAround(value, m) });
            break;
        }
    }
    // Obfuscation heuristic — a long value that is mostly non-alphanumeric.
    if (value.length > 20) {
        const specials = (value.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
        if (specials / value.length > 0.4) {
            found.push({ field, kind: 'excessive_specials', snippet: value.slice(0, 40).trim() });
        }
    }
    return found;
}

/**
 * Screen the sanitized provider input for adversarial / probing signals.
 * Returns every anomaly found across the tenant-controlled free-text fields.
 */
export function detectInputAnomalies(input: RiskAssessmentInput): AnomalyReport {
    const anomalies: InputAnomaly[] = [];

    anomalies.push(...scanField('tenantIndustry', input.tenantIndustry));
    anomalies.push(...scanField('tenantContext', input.tenantContext));
    for (const fw of input.frameworks) anomalies.push(...scanField('framework', fw));
    for (const asset of input.assets) anomalies.push(...scanField('asset.name', asset.name));
    for (const c of input.existingControls ?? []) anomalies.push(...scanField('existingControl', c));

    return { anomalies, flagged: anomalies.length > 0 };
}
