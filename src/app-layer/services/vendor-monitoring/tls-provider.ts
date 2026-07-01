/**
 * Public TLS / security-header grade providers.
 *
 * The light, free external signal: fetch the vendor's homepage over HTTPS and
 * grade which security headers it serves (HSTS, CSP, X-Frame-Options, …) —
 * an SSL-Labs-style public grade at zero cost, no API key. Rides the shared
 * `fetchWithRetry` seam. NOT a paid SecurityScorecard/BitSight rating (future
 * connector).
 */
import { fetchWithRetry } from '@/lib/http/fetch-with-retry';
import { gradeSecurityHeaders } from './evaluate';
import type { TlsProvider, TlsSignal } from './types';

/**
 * Deterministic stub — grades from the domain hash, no network. A given
 * domain always yields the same grade across runs.
 */
export class TestModeTlsProvider implements TlsProvider {
    readonly name = 'stub';

    async grade(domain: string): Promise<TlsSignal> {
        const hash = simpleHash(domain);
        // Synthesize a header set from the hash so grades span A..F stably.
        const all = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
        const present = all.filter((_, i) => ((hash >> i) & 1) === 1);
        const headers: Record<string, string> = {};
        for (const h of present) headers[h] = 'stub';
        const g = gradeSecurityHeaders(headers);
        return {
            source: this.name,
            grade: g.grade,
            checkedAt: new Date(0).toISOString(),
            presentHeaders: g.presentHeaders,
            missingHeaders: g.missingHeaders,
        };
    }
}

/** Real provider — HEAD/GET the homepage, grade the response headers. */
export class HeaderGradeTlsProvider implements TlsProvider {
    readonly name = 'header-grade';

    async grade(domain: string): Promise<TlsSignal> {
        const now = new Date().toISOString();
        try {
            const res = await fetchWithRetry(
                `https://${domain.trim().toLowerCase()}`,
                { method: 'GET', headers: { 'User-Agent': 'InflectCompliance-VendorMonitor/1.0' } },
                { timeout: 8000, maxRetries: 2, retryDelay: 1000 },
            );
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => { headers[k] = v; });
            const g = gradeSecurityHeaders(headers);
            return {
                source: this.name,
                grade: g.grade,
                checkedAt: now,
                presentHeaders: g.presentHeaders,
                missingHeaders: g.missingHeaders,
            };
        } catch {
            // Unreachable host → ungraded (null), not a failing grade — we
            // don't punish a vendor for a transient network error.
            return { source: this.name, grade: null, checkedAt: now, presentHeaders: [], missingHeaders: [] };
        }
    }
}

export function getTlsProvider(providerName?: string): TlsProvider {
    if (providerName === 'header-grade') return new HeaderGradeTlsProvider();
    return new TestModeTlsProvider();
}

function simpleHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}
