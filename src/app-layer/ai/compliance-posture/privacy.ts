/**
 * AI Compliance-Posture Summary — Privacy documentation.
 *
 * The posture signals are ALREADY fully aggregated (counts + percentages +
 * catalog-derived framework labels). There is deliberately NO raw entity
 * text, ID, email, or PII in `PostureSummaryInput` — so, unlike the
 * risk-assessment sanitizer, there is nothing to strip. This module documents
 * exactly what leaves the process when an external LLM provider is enabled and
 * provides a human-readable one-liner for the audit/observability log.
 *
 * SENT to the model (safe — aggregate only):
 *   - control coverage counts + percent
 *   - per-framework coverage (catalog name + counts)
 *   - open-risk counts by severity band
 *   - evidence / task / policy / vendor / finding COUNTS
 *   - self-assessed maturity average (0-5)
 *
 * NEVER sent: tenant id/slug, user ids/emails, entity names, free-text
 *   descriptions, evidence contents, or any per-record identifier.
 */
import type { PostureSummaryInput } from './types';

export function describePayload(input: PostureSummaryInput): string {
    return [
        `coverage=${input.controls.coveragePercent}%`,
        `frameworks=${input.frameworks.length}`,
        `risks=${input.risks.total}(H/C=${input.risks.high + input.risks.critical})`,
        `evidenceOverdue=${input.evidence.overdue}`,
        `tasksOverdue=${input.tasks.overdue}`,
        `findingsOpen=${input.findings.open}`,
    ].join('; ');
}
