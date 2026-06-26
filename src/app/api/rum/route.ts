/**
 * POST /api/rum — Real-user-monitoring beacon sink.
 *
 * Receives one Web Vital per beacon from `src/lib/observability/rum.ts`
 * (via `navigator.sendBeacon`) and records it into the `web_vitals.*`
 * OTel histograms. Returns 204 instantly.
 *
 * Deliberately UNAUTHENTICATED: requiring auth would lose pre-login and
 * sign-in-page measurements (some of the most latency-sensitive). The
 * payload carries no credentials; the route opts OUT of the mutation
 * rate-limiter (`rateLimit: false`) because a normal session emits
 * ~50 beacons and the limiter is sized for business writes. The read
 * limiter never applies (it targets tenant GETs under /api/t/).
 *
 * Cardinality discipline: the route label is normalized
 * (`normalizeRoute` collapses tenant slug + ids); `ua` is coarse
 * (Desktop/Mobile/Tablet); `rating` is web-vitals' good/needs-improvement/
 * poor. No per-user labels — these are aggregate distributions.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { normalizeRoute, recordWebVital } from '@/lib/observability/metrics';

const VALID_METRICS = new Set(['LCP', 'FCP', 'INP', 'TTFB', 'CLS']);
const VALID_RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export const POST = withApiErrorHandling(
    async (req: NextRequest): Promise<NextResponse> => {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            // Malformed beacon — accept-and-drop (204). Never error a beacon.
            return new NextResponse(null, { status: 204 });
        }

        const p = body as Record<string, unknown>;
        const metric = typeof p.metric === 'string' ? p.metric.toUpperCase() : '';
        const value = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;

        if (VALID_METRICS.has(metric) && value !== null) {
            const route = normalizeRoute(typeof p.route === 'string' ? p.route : '/');
            const ua = p.ua === 'Mobile' || p.ua === 'Tablet' ? p.ua : 'Desktop';
            const rating = typeof p.rating === 'string' && VALID_RATINGS.has(p.rating) ? p.rating : 'unknown';
            recordWebVital(metric, value, { route, ua, rating });
        }

        return new NextResponse(null, { status: 204 });
    },
    { rateLimit: false },
);
