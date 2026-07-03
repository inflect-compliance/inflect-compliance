/**
 * AI Guard — egress / DLP scanner.
 *
 * `scanEgress(payload)` detects secret / exfil material in OUTBOUND content:
 * text sent to the model provider, and agent-proposed outputs / tool-args
 * before they can be committed. It accepts either a string or an arbitrary
 * JSON-ish payload (object / array) — the payload is flattened to its string
 * leaves and each is scanned.
 *
 * Unlike the injection scanner it does NOT lower-case (secret shapes such as
 * `AKIA…` are case-sensitive); it applies only the confidentiality-preserving
 * folds — zero-width strip, whitespace collapse, and encoded-blob decode — so
 * a base64-wrapped key is still caught. It returns a verdict + rule ids only,
 * never the raw secret material.
 *
 * Verdict mapping:
 *   - malicious  — any `high`-severity egress rule fired (a real secret shape).
 *   - suspicious — only `medium`/`low` rules fired (generic high-entropy shape).
 *   - clean      — nothing fired.
 *
 * Pure + deterministic.
 */
import { EGRESS_RULES, type GuardSeverity } from './patterns';
import type { GuardVerdict, ScanResult } from './injection-scanner';

const SEVERITY_RANK: Record<GuardSeverity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Case-preserving fold for egress: strip zero-width chars, decode embedded
 * base64/hex blobs (append plaintext), collapse whitespace — but keep case.
 */
function foldForEgress(input: string): string {
    let out = input;
    // Append base64 decodings (mirrors normalize.ts but case-preserving).
    const b64 = /[A-Za-z0-9+/]{16,}={0,2}/g;
    const extra: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = b64.exec(input)) !== null) {
        const blob = m[0];
        if (blob.replace(/=+$/, '').length % 4 === 1) continue;
        try {
            const decoded = Buffer.from(blob, 'base64').toString('utf8');
            if (/^[\x09\x0a\x0d\x20-\x7e]{4,}$/.test(decoded)) extra.push(decoded);
        } catch {
            // ignore
        }
    }
    if (extra.length) out = `${out} ${extra.join(' ')}`;
    out = out.replace(
        new RegExp('[\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]', 'g'),
        '',
    );
    out = out.replace(/[ \t]+/g, ' ');
    return out;
}

/** Flatten a payload to its string leaves (bounded depth). */
function collectStrings(value: unknown, out: string[], depth = 0): void {
    if (depth > 12) return;
    if (typeof value === 'string') {
        out.push(value);
    } else if (Array.isArray(value)) {
        for (const v of value) collectStrings(v, out, depth + 1);
    } else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) collectStrings(v, out, depth + 1);
    }
}

export function scanEgress(payload: unknown): ScanResult {
    const leaves: string[] = [];
    collectStrings(payload, leaves);
    if (leaves.length === 0) return { verdict: 'clean', ruleIds: [] };

    const combined = foldForEgress(leaves.join('\n'));
    if (!combined) return { verdict: 'clean', ruleIds: [] };

    const ruleIds: string[] = [];
    let maxRank = -1;
    let maxSeverity: GuardSeverity | undefined;

    for (const rule of EGRESS_RULES) {
        if (rule.test(combined)) {
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
