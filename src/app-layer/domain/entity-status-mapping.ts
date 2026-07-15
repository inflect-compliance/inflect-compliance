/**
 * Elevation PR-1 — shared status → StatusBadge variant mappings.
 *
 * Until this PR each detail page redeclared its own STATUS_VARIANT
 * literal:
 *   risks/[riskId]/page.tsx::STATUS_VARIANT
 *   controls/[controlId]/page.tsx (inline ternaries)
 *   tasks/[taskId]/page.tsx (inline)
 *   policies/[policyId]/page.tsx::STATUS_BADGE
 *   etc.
 * Result: the same domain enum mapped to subtly different badge tones
 * across pages. Consolidating into one file ensures every consumer
 * (MetaStrip, list-row badge, dashboard distribution) reads the same
 * vocabulary.
 *
 * The mappings live in the app-layer (not src/lib) because they're
 * domain semantics — what a "Risk OPEN" or "Policy DRAFT" means
 * visually is a product-design decision, not a UI primitive.
 */

import type { StatusBadgeVariant } from '@/components/ui/status-badge';
import { TASK_STATUS_BADGE } from '@/lib/task-status-badge';

// ─── Risk status ─────────────────────────────────────────────────────

export const RISK_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    OPEN: 'warning',
    MITIGATING: 'info',
    // Audit Coherence S1 — controls in place, residual score
    // computed, awaiting explicit acceptance call. Distinct from
    // MITIGATING (work in progress) and ACCEPTED (signed off).
    MITIGATED: 'success',
    ACCEPTED: 'neutral',
    CLOSED: 'success',
};

// ─── Risk score band ─────────────────────────────────────────────────

export interface RiskScoreBand {
    label: string;
    variant: StatusBadgeVariant;
}

/**
 * Map a numeric risk score (0-25 likelihood × impact) to a labelled
 * band. Mirrors the `score-0-25` scale in `@/lib/design/status-tone`.
 */
export function getRiskScoreBand(score: number): RiskScoreBand {
    if (score <= 5) return { label: 'Low', variant: 'success' };
    if (score <= 12) return { label: 'Medium', variant: 'warning' };
    if (score <= 18) return { label: 'High', variant: 'warning' };
    return { label: 'Critical', variant: 'error' };
}

// ─── Control status ──────────────────────────────────────────────────

export const CONTROL_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    NOT_STARTED: 'neutral',
    IN_PROGRESS: 'info',
    IMPLEMENTED: 'success',
    NEEDS_REVIEW: 'warning',
};

export const CONTROL_APPLICABILITY_VARIANT: Record<string, StatusBadgeVariant> = {
    APPLICABLE: 'info',
    NOT_APPLICABLE: 'neutral',
    EXCLUDED: 'neutral',
};

// ─── Task / WorkItem status ──────────────────────────────────────────

// Derived from the single source of truth in `@/lib/task-status-badge`
// (Tasks roadmap TP-1) — kept as a thin compat alias so existing
// callers (and the shape unit test) that want just the tone keep
// working. Do NOT re-inline this literal; edit `TASK_STATUS_BADGE`.
export const TASK_STATUS_VARIANT: Record<string, StatusBadgeVariant> =
    Object.fromEntries(
        Object.entries(TASK_STATUS_BADGE).map(([status, spec]) => [status, spec.variant]),
    );

export const TASK_SEVERITY_VARIANT: Record<string, StatusBadgeVariant> = {
    INFO: 'neutral',
    LOW: 'info',
    MEDIUM: 'warning',
    HIGH: 'warning',
    CRITICAL: 'error',
};

// ─── Policy status / approval ────────────────────────────────────────

export const POLICY_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    DRAFT: 'neutral',
    IN_REVIEW: 'info',
    PUBLISHED: 'success',
    ARCHIVED: 'warning',
};

export const POLICY_APPROVAL_VARIANT: Record<string, StatusBadgeVariant> = {
    PENDING: 'info',
    APPROVED: 'success',
    REJECTED: 'error',
};

// ─── Vendor status / criticality ─────────────────────────────────────

export const VENDOR_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    ACTIVE: 'success',
    ONBOARDING: 'info',
    OFFBOARDING: 'warning',
    OFFBOARDED: 'neutral',
};

export const VENDOR_CRITICALITY_VARIANT: Record<string, StatusBadgeVariant> = {
    LOW: 'neutral',
    MEDIUM: 'warning',
    HIGH: 'error',
    CRITICAL: 'error',
};

// Vendor assessment lifecycle (separate from vendor status).
// Covers BOTH the legacy World-A approval flow (DRAFT/IN_REVIEW/APPROVED/
// REJECTED) and the live G-3 send-and-collect lifecycle
// (SENT → IN_PROGRESS → SUBMITTED → REVIEWED → CLOSED). Every enum value
// has a tone so no status renders the default-neutral fallback.
export const VENDOR_ASSESSMENT_VARIANT: Record<string, StatusBadgeVariant> = {
    // Legacy World-A.
    DRAFT: 'neutral',
    IN_REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'error',
    // G-3 / World-B.
    SENT: 'info',
    IN_PROGRESS: 'info',
    SUBMITTED: 'warning',
    REVIEWED: 'success',
    CLOSED: 'neutral',
};

// i18n message key (under the `vendors.statusLabel` block) for a
// vendor-assessment status enum value. Client surfaces render
// `t(vendorAssessmentStatusLabelKey(status))` instead of the raw enum.
export function vendorAssessmentStatusLabelKey(status: string): string {
    return `statusLabel.${status}`;
}

// The live G-3 "send-and-collect" lifecycle statuses. An assessment in any
// of these opens the internal review surface (which adapts by status:
// read-only progress before SUBMITTED, review at SUBMITTED, close at
// REVIEWED, history when CLOSED). Anything else is a retired legacy
// World-A row (DRAFT/IN_REVIEW/APPROVED/REJECTED) with no responder — the
// vendor-table routes those to a non-actionable marker. This is the single
// source of truth for the vendor-table "Open →" routing-by-status logic.
const G3_ASSESSMENT_STATUSES: ReadonlySet<string> = new Set([
    'SENT',
    'IN_PROGRESS',
    'SUBMITTED',
    'REVIEWED',
    'CLOSED',
]);

export function isG3AssessmentStatus(status: string): boolean {
    return G3_ASSESSMENT_STATUSES.has(status);
}
