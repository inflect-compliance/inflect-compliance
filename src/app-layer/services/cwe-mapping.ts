/**
 * CWE → framework cross-walk. Scanner findings carry CWE refs; this
 * curated table maps each to its OWASP Top 10 (2021) category and the
 * NIST SSDF (SP 800-218) practice it most relates to, so a finding can
 * surface "relates to OWASP A03 / SSDF PW.5" in the UI and flow into the
 * cross-framework traceability the product already has.
 *
 * This is REFERENCE DATA, not a score. It deliberately introduces no
 * composite/aggregate grade — coverage is expressed elsewhere as
 * control-evidence completeness (a transparent, framework-tied number).
 *
 * The OWASP mapping follows the official OWASP Top 10 2021 CWE lists. The
 * SSDF practice is the coarse "which secure-SDLC practice does this weak­
 * ness implicate" hint (PW.5 secure coding is the default for a code-level
 * weakness; the act of detecting it is PW.8 test + RV.1 vuln-identify).
 */
export interface FrameworkRef {
    /** OWASP Top 10 2021 category, e.g. 'A03:2021-Injection'. */
    owasp: string;
    /** NIST SSDF (SP 800-218) practice id, e.g. 'PW.5'. */
    ssdf: string;
}

const CWE_MAP: Record<string, FrameworkRef> = {
    // A01 Broken Access Control
    'CWE-22': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-200': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-284': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-285': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-352': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-639': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-862': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    'CWE-863': { owasp: 'A01:2021-Broken Access Control', ssdf: 'PW.5' },
    // A02 Cryptographic Failures
    'CWE-295': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    'CWE-311': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    'CWE-319': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    'CWE-327': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    'CWE-328': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    'CWE-916': { owasp: 'A02:2021-Cryptographic Failures', ssdf: 'PW.5' },
    // A03 Injection
    'CWE-77': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-78': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-79': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-89': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-90': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-94': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    'CWE-643': { owasp: 'A03:2021-Injection', ssdf: 'PW.5' },
    // A04 Insecure Design
    'CWE-209': { owasp: 'A04:2021-Insecure Design', ssdf: 'PW.1' },
    'CWE-256': { owasp: 'A04:2021-Insecure Design', ssdf: 'PW.1' },
    'CWE-501': { owasp: 'A04:2021-Insecure Design', ssdf: 'PW.1' },
    'CWE-522': { owasp: 'A04:2021-Insecure Design', ssdf: 'PW.1' },
    // A05 Security Misconfiguration
    'CWE-16': { owasp: 'A05:2021-Security Misconfiguration', ssdf: 'PW.9' },
    'CWE-611': { owasp: 'A05:2021-Security Misconfiguration', ssdf: 'PW.5' },
    'CWE-614': { owasp: 'A05:2021-Security Misconfiguration', ssdf: 'PW.9' },
    'CWE-732': { owasp: 'A05:2021-Security Misconfiguration', ssdf: 'PW.9' },
    'CWE-776': { owasp: 'A05:2021-Security Misconfiguration', ssdf: 'PW.5' },
    // A06 Vulnerable & Outdated Components (SCA territory)
    'CWE-937': { owasp: 'A06:2021-Vulnerable and Outdated Components', ssdf: 'PW.4' },
    'CWE-1035': { owasp: 'A06:2021-Vulnerable and Outdated Components', ssdf: 'PW.4' },
    'CWE-1104': { owasp: 'A06:2021-Vulnerable and Outdated Components', ssdf: 'PW.4' },
    // A07 Identification & Authentication Failures
    'CWE-287': { owasp: 'A07:2021-Identification and Authentication Failures', ssdf: 'PW.5' },
    'CWE-297': { owasp: 'A07:2021-Identification and Authentication Failures', ssdf: 'PW.5' },
    'CWE-384': { owasp: 'A07:2021-Identification and Authentication Failures', ssdf: 'PW.5' },
    'CWE-620': { owasp: 'A07:2021-Identification and Authentication Failures', ssdf: 'PW.5' },
    'CWE-798': { owasp: 'A07:2021-Identification and Authentication Failures', ssdf: 'PW.5' },
    // A08 Software & Data Integrity Failures
    'CWE-345': { owasp: 'A08:2021-Software and Data Integrity Failures', ssdf: 'PW.4' },
    'CWE-494': { owasp: 'A08:2021-Software and Data Integrity Failures', ssdf: 'PW.4' },
    'CWE-502': { owasp: 'A08:2021-Software and Data Integrity Failures', ssdf: 'PW.5' },
    'CWE-829': { owasp: 'A08:2021-Software and Data Integrity Failures', ssdf: 'PW.4' },
    // A09 Security Logging & Monitoring Failures
    'CWE-117': { owasp: 'A09:2021-Security Logging and Monitoring Failures', ssdf: 'PW.5' },
    'CWE-223': { owasp: 'A09:2021-Security Logging and Monitoring Failures', ssdf: 'PW.5' },
    'CWE-532': { owasp: 'A09:2021-Security Logging and Monitoring Failures', ssdf: 'PW.5' },
    'CWE-778': { owasp: 'A09:2021-Security Logging and Monitoring Failures', ssdf: 'PW.5' },
    // A10 Server-Side Request Forgery
    'CWE-918': { owasp: 'A10:2021-Server-Side Request Forgery', ssdf: 'PW.5' },
};

/** Normalise a CWE ref to canonical `CWE-<n>` form (or null if not one). */
export function normalizeCwe(raw: string): string | null {
    const m = /CWE[-_ ]?(\d+)/i.exec(raw);
    return m ? `CWE-${m[1]}` : null;
}

/** Map a single CWE to its framework refs, or null when uncurated. */
export function mapCwe(cweId: string): FrameworkRef | null {
    const norm = normalizeCwe(cweId);
    return norm ? CWE_MAP[norm] ?? null : null;
}

/**
 * Map a set of CWE refs → the distinct OWASP categories + SSDF practices
 * they relate to. Uncurated CWEs are skipped (never guessed).
 */
export function mapCwes(cweIds: string[]): { owasp: string[]; ssdf: string[] } {
    const owasp = new Set<string>();
    const ssdf = new Set<string>();
    for (const c of cweIds) {
        const ref = mapCwe(c);
        if (ref) {
            owasp.add(ref.owasp);
            ssdf.add(ref.ssdf);
        }
    }
    return { owasp: [...owasp].sort(), ssdf: [...ssdf].sort() };
}
