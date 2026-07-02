/**
 * AI Compliance-Posture Summary — Types & Interfaces
 *
 * Provider abstraction so the AI backend can be swapped (deterministic stub
 * for dev/test + zero-config fallback; Anthropic / OpenRouter for the real
 * LLM narrative). Mirrors the shape of `../risk-assessment/types.ts`.
 *
 * The INPUT is a fully-aggregated, tenant-scoped signals snapshot — no raw
 * entity names, free text, IDs, or PII. The OUTPUT is a short narrative +
 * a small set of prioritized next actions.
 */

// ─── Posture label ───

/** The four coarse posture bands surfaced as the hero headline. */
export type PostureLabel = 'STRONG' | 'ESTABLISHED' | 'DEVELOPING' | 'AT_RISK';

export const POSTURE_LABELS: readonly PostureLabel[] = [
    'STRONG',
    'ESTABLISHED',
    'DEVELOPING',
    'AT_RISK',
] as const;

/** Priority ranking for an advice item. */
export type AdvicePriority = 'high' | 'medium' | 'low';

// ─── Provider Input (sanitized aggregate signals) ───

/** Per-framework coverage snapshot — aggregate counts only. */
export interface FrameworkCoverageSignal {
    /** Framework key (e.g. "ISO27001"). Catalog-derived, not tenant free text. */
    key: string;
    /** Human name (e.g. "ISO/IEC 27001"). From the global catalog. */
    name: string;
    /** Requirements mapped to at least one control. */
    mapped: number;
    /** Total requirements in the framework. */
    total: number;
    /** mapped / total × 100, rounded. */
    coveragePercent: number;
}

/**
 * The aggregate signals fed to the summary generator. Every field is a
 * number, a small enum, or a catalog-derived label — safe to send to an
 * external model (documented in `privacy.ts::describePayload`).
 */
export interface PostureSummaryInput {
    /** Control coverage across the whole tenant. */
    controls: {
        applicable: number;
        implemented: number;
        inProgress: number;
        notStarted: number;
        /** implemented / applicable × 100, rounded to 1 decimal. */
        coveragePercent: number;
    };
    /** Per-framework coverage for the frameworks the tenant has mapped. */
    frameworks: FrameworkCoverageSignal[];
    /** Open risk counts by severity band. */
    risks: {
        total: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    /** Evidence freshness. */
    evidence: {
        overdue: number;
        dueSoon: number;
        current: number;
    };
    /** Open findings + overdue work. */
    findings: { open: number };
    tasks: { open: number; overdue: number };
    policies: { total: number; overdueReview: number };
    vendors: { overdueReview: number };
    /**
     * Optional self-assessed maturity band (org-maturity.ts), 0-5 average.
     * Null when the tenant has rated no maturity domains.
     */
    maturityAverage: number | null;
}

// ─── Provider Output ───

export interface PostureAdviceItem {
    /** Short imperative headline (≤ ~60 chars). */
    title: string;
    /** One-sentence rationale / how-to (≤ ~200 chars). */
    detail: string;
    priority: AdvicePriority;
}

export interface PostureSummaryResult {
    postureLabel: PostureLabel;
    /** 0-100; null when not computable. */
    maturityScore: number | null;
    /** The narrative (1-3 sentences). */
    summaryText: string;
    /** Prioritized next actions (≤ 5, output-guard clamps). */
    advice: PostureAdviceItem[];
    /** Provider that produced this result. */
    provider: string;
    /** Model id when an LLM produced it; absent for the stub. */
    model?: string;
    /** True when produced by the deterministic stub / fallback. */
    isFallback?: boolean;
}

// ─── Provider Interface ───

export interface CompliancePostureProvider {
    readonly providerName: string;
    generate(input: PostureSummaryInput): Promise<PostureSummaryResult>;
}
