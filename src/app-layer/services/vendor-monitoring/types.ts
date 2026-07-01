/**
 * Continuous vendor-monitoring signal contracts.
 *
 * Two external-signal families, each with a provider interface + a
 * deterministic CI-safe stub + a real fetch-backed provider. Mirrors the
 * `vendor-enrichment.ts` provider/stub/factory shape and rides the shared
 * `fetchWithRetry` HTTP seam — NOT a parallel fetch path.
 *
 * These are the FREE / public signals (breach-DB domain check + a public
 * TLS / security-header grade). Paid security-rating integrations
 * (SecurityScorecard, BitSight) are a deliberate future connector — see
 * `docs/vendor-monitoring.md`.
 */

/** A single breach observation for a domain. */
export interface BreachRecord {
    /** Breach name / title, e.g. "Acme 2024 data exposure". */
    name: string;
    /** ISO date the breach occurred / was disclosed, if known. */
    date?: string;
}

export interface BreachSignal {
    /** Provider name (for provenance on the posture event). */
    source: string;
    /** True if the domain appears in ≥1 monitored breach. */
    breached: boolean;
    /** Most recent breach date across all hits (ISO), if any. */
    latestBreachAt?: string;
    breaches: BreachRecord[];
}

export interface BreachProvider {
    readonly name: string;
    /** Check a vendor domain against the breach feed. */
    check(domain: string): Promise<BreachSignal>;
}

export interface TlsSignal {
    source: string;
    /** Letter grade A..F, or null when the domain couldn't be graded. */
    grade: string | null;
    /** ISO timestamp of the grade. */
    checkedAt: string;
    /** Which security headers were present (for the timeline detail). */
    presentHeaders: string[];
    /** Which expected security headers were missing. */
    missingHeaders: string[];
}

export interface TlsProvider {
    readonly name: string;
    /** Grade a vendor domain's public TLS / security-header posture. */
    grade(domain: string): Promise<TlsSignal>;
}
