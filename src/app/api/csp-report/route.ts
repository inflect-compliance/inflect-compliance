import { NextResponse } from 'next/server';

// Edge runtime: a pure, stateless forwarder — no Prisma, no Node modules,
// just fetch + URL + Request. Browsers send CSP reports here from anywhere,
// so terminating at the nearest edge PoP saves the cold-start + cross-region
// hop on a fire-and-forget request. Locked by
// tests/guardrails/edge-runtime-coverage.test.ts.
export const runtime = 'edge';

/**
 * Legacy CSP report endpoint — redirects to the new hardened endpoint.
 *
 * This redirect exists because the old CSP header pointed report-uri here.
 * Browsers may still send reports to this path from cached CSP headers.
 * After cache TTLs expire, this redirect can be removed.
 */
export async function POST(request: Request): Promise<NextResponse> {
    // Forward the body to the new endpoint
    const body = await request.text();
    const newUrl = new URL('/api/security/csp-report', request.url);

    try {
        await fetch(newUrl.toString(), {
            method: 'POST',
            headers: {
                'content-type': request.headers.get('content-type') ?? 'application/csp-report',
            },
            body,
        });
    } catch {
        // Ignore forwarding failures — best effort
    }

    return new NextResponse(null, { status: 204 });
}
