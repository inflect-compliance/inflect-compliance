/**
 * AI Guard — injection scanner.
 *
 * `scanInjection(text)` normalizes the text (defeating base64 / homoglyph /
 * zero-width evasion) THEN matches the injection rule table. It returns a
 * verdict + the matched rule ids ONLY — never the raw matched text, so the
 * caller can safely audit/log the result.
 *
 * Verdict mapping:
 *   - malicious  — any `high`-severity injection rule fired.
 *   - suspicious — only `medium`/`low` rules fired.
 *   - clean      — nothing fired.
 *
 * Pure + deterministic.
 */
import { normalizeForScan } from './normalize';
import { INJECTION_RULES, type GuardSeverity } from './patterns';

export type GuardVerdict = 'clean' | 'suspicious' | 'malicious';

export interface ScanResult {
    verdict: GuardVerdict;
    /** Stable rule ids that fired. Safe to log — carry no user content. */
    ruleIds: string[];
    /** Highest severity observed (undefined when clean). */
    maxSeverity?: GuardSeverity;
}

const SEVERITY_RANK: Record<GuardSeverity, number> = { low: 0, medium: 1, high: 2 };

export function scanInjection(text: string | null | undefined): ScanResult {
    if (!text) return { verdict: 'clean', ruleIds: [] };
    const normalized = normalizeForScan(text);
    if (!normalized) return { verdict: 'clean', ruleIds: [] };

    const ruleIds: string[] = [];
    let maxRank = -1;
    let maxSeverity: GuardSeverity | undefined;

    for (const rule of INJECTION_RULES) {
        if (rule.test(normalized)) {
            ruleIds.push(rule.id);
            if (SEVERITY_RANK[rule.severity] > maxRank) {
                maxRank = SEVERITY_RANK[rule.severity];
                maxSeverity = rule.severity;
            }
        }
    }

    if (ruleIds.length === 0) return { verdict: 'clean', ruleIds: [] };
    const verdict: GuardVerdict = maxSeverity === 'high' ? 'malicious' : 'suspicious';
    return { verdict, ruleIds, maxSeverity };
}
