/**
 * Webhook URL safety (SSRF guard) for automation WEBHOOK actions.
 *
 * A rule's webhook URL is operator-supplied, so without a guard any tenant
 * admin who can author a rule gets a server-side request-forgery primitive
 * against the host's internal network (cloud metadata, Redis, RFC-1918, …).
 *
 * Policy: https only, and the resolved host must be a public address. The
 * literal-host check below blocks the obvious cases synchronously; callers
 * should additionally resolve DNS and re-check (see `assertPublicAddress`)
 * to defeat hostnames that point at private space.
 */

const PRIVATE_V4 = [
    /^10\./,
    /^127\./,
    /^0\./,
    /^169\.254\./, // link-local incl. cloud metadata 169.254.169.254
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16/12
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // CGNAT 100.64/10
];

/** True for a raw IP literal (v4/v6) that is private / loopback / link-local. */
export function isPrivateAddress(host: string): boolean {
    const h = host.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
    if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true; // v6 link-local + ULA
    if (h.startsWith('::ffff:')) return isPrivateAddress(h.slice(7)); // v4-mapped v6
    return PRIVATE_V4.some((re) => re.test(h));
}

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata',
    'metadata.google.internal',
]);

export interface WebhookUrlVerdict {
    ok: boolean;
    reason?: string;
    host?: string;
}

/**
 * Synchronous structural check: scheme + literal-host + obvious-name blocks.
 * Returns the host so the caller can DNS-resolve and re-check.
 */
export function checkWebhookUrl(rawUrl: string): WebhookUrlVerdict {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return { ok: false, reason: 'malformed URL' };
    }
    if (url.protocol !== 'https:') {
        return { ok: false, reason: 'only https webhooks are allowed' };
    }
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
        return { ok: false, reason: `blocked host ${host}`, host };
    }
    if (isPrivateAddress(host)) {
        return { ok: false, reason: `private address ${host}`, host };
    }
    return { ok: true, host };
}
