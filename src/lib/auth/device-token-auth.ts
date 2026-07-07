/**
 * Device-agent token auth (PR-5).
 *
 * A per-tenant token that lets an endpoint agent POST its posture to
 * `/api/t/:slug/devices/report` with no user session. SHA-256 hash at rest
 * (high-entropy token, like TenantApiKey), single-use lookup by hash. Cloned
 * from `api-key-auth.ts`.
 */
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const DEVICE_TOKEN_PREFIX = 'icdt_';
const TOKEN_RANDOM_BYTES = 24; // 192 bits
const PREFIX_DISPLAY_LENGTH = 8;

/** Generate a device token. `plaintext` is shown once. */
export function generateDeviceToken(): { plaintext: string; tokenHash: string; tokenPrefix: string } {
    const randomPart = crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
    const plaintext = `${DEVICE_TOKEN_PREFIX}${randomPart}`;
    return {
        plaintext,
        tokenHash: hashDeviceToken(plaintext),
        tokenPrefix: plaintext.slice(0, DEVICE_TOKEN_PREFIX.length + PREFIX_DISPLAY_LENGTH),
    };
}

export function hashDeviceToken(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export interface DeviceTokenVerifyResult {
    valid: boolean;
    tenantId?: string;
    tokenId?: string;
    reason?: 'invalid_format' | 'not_found' | 'expired' | 'revoked';
}

/**
 * Verify a device-agent bearer token. Returns the tenantId on success and
 * touches lastUsedAt. Uses the global prisma with a hash lookup (the token IS
 * the tenant credential — there is no session context yet).
 */
export async function verifyDeviceToken(bearerToken: string, clientIp?: string | null, now: Date = new Date()): Promise<DeviceTokenVerifyResult> {
    if (!bearerToken || !bearerToken.startsWith(DEVICE_TOKEN_PREFIX)) {
        return { valid: false, reason: 'invalid_format' };
    }
    const tokenHash = hashDeviceToken(bearerToken);
    const token = await prisma.tenantDeviceToken.findUnique({ where: { tokenHash }, select: { id: true, tenantId: true, expiresAt: true, revokedAt: true } });
    if (!token) return { valid: false, reason: 'not_found' };
    if (token.revokedAt) return { valid: false, reason: 'revoked' };
    if (token.expiresAt && token.expiresAt < now) return { valid: false, reason: 'expired' };
    // Best-effort last-used touch — never block auth on it.
    try {
        await prisma.tenantDeviceToken.update({ where: { id: token.id }, data: { lastUsedAt: now, lastUsedIp: clientIp ?? null } });
    } catch {
        /* non-fatal */
    }
    return { valid: true, tenantId: token.tenantId, tokenId: token.id };
}

export interface DeviceReportAuth {
    ok: boolean;
    tenantId?: string;
    status?: 401 | 403;
}

/**
 * Full auth for the device-report route: verify the bearer token AND confirm
 * its tenant matches the URL slug (a token can't report cross-tenant). Keeps
 * the prisma tenant lookup out of the route handler.
 */
export async function authorizeDeviceReport(bearerToken: string, tenantSlug: string, clientIp?: string | null, now: Date = new Date()): Promise<DeviceReportAuth> {
    const verified = await verifyDeviceToken(bearerToken, clientIp, now);
    if (!verified.valid || !verified.tenantId) return { ok: false, status: 401 };
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant || tenant.id !== verified.tenantId) return { ok: false, status: 403 };
    return { ok: true, tenantId: verified.tenantId };
}
