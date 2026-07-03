/**
 * Webhook URL safety (SSRF guard) for automation WEBHOOK actions.
 *
 * A rule's webhook URL is operator-supplied, so without a guard any tenant
 * admin who can author a rule gets a server-side request-forgery primitive
 * against the host's internal network (cloud metadata, Redis, RFC-1918, …).
 *
 * Policy: https only, and the resolved host must be a public address. The
 * literal-host check below blocks the obvious cases synchronously; callers
 * should use `safeFetch` (or `assertPublicAddress`) which additionally
 * resolve DNS and re-check EVERY resolved address to defeat hostnames that
 * point at private space (DNS rebinding).
 */

import { promises as dnsPromises } from 'node:dns';
import { Agent } from 'undici';

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

/** Thrown when a tenant-controlled URL fails the SSRF egress guard. */
export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

export interface PublicAddressResult {
    url: URL;
    host: string;
    /** Every A/AAAA the host resolved to — all validated public. */
    addresses: { address: string; family: number }[];
}

/**
 * Full async SSRF guard: the synchronous `checkWebhookUrl` structural check
 * PLUS a DNS resolution of the host with EVERY resolved A/AAAA re-checked
 * against `isPrivateAddress`. Defeats DNS rebinding — a public hostname that
 * resolves into private / loopback / link-local / cloud-metadata space is
 * rejected. Throws `SsrfBlockedError` on any failure; returns the resolved
 * addresses so the caller can pin the connection (see `safeFetch`).
 */
export async function assertPublicAddress(rawUrl: string): Promise<PublicAddressResult> {
    const verdict = checkWebhookUrl(rawUrl);
    if (!verdict.ok || !verdict.host) {
        throw new SsrfBlockedError(verdict.reason ?? 'blocked URL');
    }
    const { host } = verdict;
    let addresses: { address: string; family: number }[];
    try {
        addresses = await dnsPromises.lookup(host, { all: true });
    } catch {
        throw new SsrfBlockedError(`cannot resolve ${host}`);
    }
    if (addresses.length === 0) {
        throw new SsrfBlockedError(`no addresses for ${host}`);
    }
    for (const a of addresses) {
        if (isPrivateAddress(a.address)) {
            throw new SsrfBlockedError(`${host} resolves to private address ${a.address}`);
        }
    }
    return { url: new URL(rawUrl), host, addresses };
}

/**
 * SSRF-safe `fetch` for any tenant-controlled URL. Runs `assertPublicAddress`
 * (structural + DNS re-check of every resolved address), then PINS the
 * connection to those pre-validated IPs via an undici dispatcher whose
 * `lookup` returns only them — so DNS cannot change between the check and the
 * connect (TOCTOU). The original hostname is preserved for TLS SNI + cert
 * validation. Throws `SsrfBlockedError` if the URL is unsafe.
 */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
    const { addresses } = await assertPublicAddress(rawUrl);
    const pinned = addresses.map((a) => ({
        address: a.address,
        family: (a.family === 6 ? 6 : 4) as 4 | 6,
    }));
    const dispatcher = new Agent({
        // Short-lived: this Agent serves only this one pinned request.
        keepAliveTimeout: 1,
        keepAliveMaxTimeout: 1,
        connect: {
            // undici calls lookup with `all: true` and expects an address list.
            lookup: (
                _hostname: string,
                _options: unknown,
                cb: (
                    err: NodeJS.ErrnoException | null,
                    addrs: { address: string; family: number }[],
                ) => void,
            ) => {
                cb(null, pinned);
            },
        },
    } as unknown as ConstructorParameters<typeof Agent>[0]);
    return fetch(rawUrl, { ...init, dispatcher } as unknown as RequestInit);
}
