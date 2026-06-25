/**
 * MFA Enrollment Usecases
 *
 * TOTP enrollment lifecycle:
 * - startMfaEnrollment: generates secret, encrypts, stores unverified
 * - verifyMfaEnrollment: validates TOTP code, marks as verified
 * - removeMfaEnrollment: removes enrollment (admin or self)
 *
 * SECURITY: Secrets are encrypted with AES-256-GCM. Never logged in plaintext.
 */
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '../types';
import type { VerifyMfaInputType } from '../schemas/mfa.schemas';
import {
    generateTotpSecret,
    generateTotpUri,
    encryptTotpSecret,
    decryptTotpSecret,
    verifyTotpCode,
} from '@/lib/security/totp-crypto';
import { badRequest, forbidden, internal } from '@/lib/errors/types';
import { env } from '@/env';
import { recordMfaEnrolled } from '@/lib/observability/business-metrics';

// ─── Types ──────────────────────────────────────────────────────────

export interface MfaEnrollmentStartResult {
    secret: string;     // Base32-encoded TOTP secret (shown ONCE to user)
    uri: string;        // otpauth:// URI for QR code
    enrollmentId: string;
}

export interface MfaEnrollmentVerifyResult {
    success: boolean;
    enrollmentId: string;
}

// ─── Start Enrollment ───────────────────────────────────────────────

/**
 * Starts MFA enrollment for the current user.
 * Generates a TOTP secret, encrypts it, and stores an unverified enrollment.
 * If an unverified enrollment already exists, replaces it.
 *
 * Returns the plaintext secret and otpauth URI for the user to scan.
 * The secret is ONLY returned here — it cannot be retrieved after.
 */
export async function startMfaEnrollment(
    ctx: RequestContext,
): Promise<MfaEnrollmentStartResult> {
    const authSecret = getAuthSecret();

    // Generate new TOTP secret
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, authSecret);

    // Look up user email for the URI
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        select: { email: true },
    });

    // Upsert: replace any existing unverified enrollment, or create new
    const enrollment = await prisma.userMfaEnrollment.upsert({
        where: {
            userId_tenantId_type: {
                userId: ctx.userId,
                tenantId: ctx.tenantId,
                type: 'TOTP',
            },
        },
        create: {
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            type: 'TOTP',
            secretEncrypted: encrypted,
            isVerified: false,
        },
        update: {
            secretEncrypted: encrypted,
            isVerified: false,
            verifiedAt: null,
        },
    });

    const uri = generateTotpUri(secret, user.email);

    return {
        secret,
        uri,
        enrollmentId: enrollment.id,
    };
}

// ─── Verify Enrollment ──────────────────────────────────────────────

/**
 * Verifies a TOTP code against the user's enrollment.
 * If valid, marks the enrollment as verified.
 * If no enrollment exists or it's already verified, throws.
 */
export async function verifyMfaEnrollment(
    ctx: RequestContext,
    input: VerifyMfaInputType,
): Promise<MfaEnrollmentVerifyResult> {
    const authSecret = getAuthSecret();

    const enrollment = await prisma.userMfaEnrollment.findUnique({
        where: {
            userId_tenantId_type: {
                userId: ctx.userId,
                tenantId: ctx.tenantId,
                type: 'TOTP',
            },
        },
    });

    if (!enrollment) {
        throw badRequest('No MFA enrollment found. Start enrollment first.');
    }

    if (enrollment.isVerified) {
        throw badRequest('MFA is already verified for this account.');
    }

    // Decrypt secret and verify code
    const secret = decryptTotpSecret(enrollment.secretEncrypted, authSecret);
    const isValid = verifyTotpCode(secret, input.code);

    if (!isValid) {
        return { success: false, enrollmentId: enrollment.id };
    }

    // Mark as verified
    await prisma.userMfaEnrollment.update({
        where: { id: enrollment.id },
        data: {
            isVerified: true,
            verifiedAt: new Date(),
        },
    });

    recordMfaEnrolled({ method: 'totp' });
    return { success: true, enrollmentId: enrollment.id };
}

// ─── Remove Enrollment ──────────────────────────────────────────────

/**
 * Removes MFA enrollment for a user. Allowed for:
 * - The user themselves (self-service, only if tenant policy allows)
 * - An admin (force-remove for any user in the tenant)
 */
export async function removeMfaEnrollment(
    ctx: RequestContext,
    targetUserId?: string,
): Promise<{ removed: boolean }> {
    const effectiveUserId = targetUserId || ctx.userId;

    // Non-admins can only remove their own enrollment
    if (effectiveUserId !== ctx.userId && !ctx.permissions.canAdmin) {
        throw forbidden('Only admins can remove other users\' MFA enrollment');
    }

    const result = await prisma.userMfaEnrollment.deleteMany({
        where: {
            userId: effectiveUserId,
            tenantId: ctx.tenantId,
            type: 'TOTP',
        },
    });

    return { removed: result.count > 0 };
}

// ─── Helpers ────────────────────────────────────────────────────────

function getAuthSecret(): string {
    const secret = env.AUTH_SECRET;
    if (!secret) {
        throw internal('AUTH_SECRET environment variable is required for MFA operations');
    }
    return secret;
}
