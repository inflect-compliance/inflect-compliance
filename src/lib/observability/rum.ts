/**
 * Real-user monitoring (RUM) — client-side Web Vitals beacon.
 *
 * Fires when each Web Vital settles and ships it to `/api/rum` via
 * `navigator.sendBeacon`, so navigating away from the page doesn't drop
 * the metric. The server records aggregate histograms (bounded
 * cardinality) — there are NO per-user trails here.
 *
 * Measurement only — no optimization, no analytics. See
 * docs/implementation-notes/2026-06-26-perf-baseline.md.
 */
import { onCLS, onFCP, onLCP, onINP, onTTFB, type Metric } from 'web-vitals';

let _started = false;

export function initRum(): void {
    if (typeof window === 'undefined') return;
    // Guard against double-registration under React StrictMode / HMR.
    if (_started) return;
    _started = true;

    const beacon = (metric: Metric) => {
        const payload = {
            metric: metric.name,
            value: metric.value,
            rating: metric.rating,
            id: metric.id,
            route: window.location.pathname,
            // Coarse UA grouping — Desktop / Mobile / Tablet. The full UA
            // string would explode metric cardinality.
            ua: navigator.userAgent.match(/Mobile|Tablet/)?.[0] ?? 'Desktop',
        };
        try {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/rum', blob);
        } catch {
            // sendBeacon unavailable / payload too large — drop silently.
            // RUM is best-effort; a dropped sample never affects the user.
        }
    };

    onLCP(beacon);
    onFCP(beacon);
    onINP(beacon);
    onCLS(beacon);
    onTTFB(beacon);
}
