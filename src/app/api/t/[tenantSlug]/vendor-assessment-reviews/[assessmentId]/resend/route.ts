/**
 * POST /api/t/[tenantSlug]/vendor-assessment-reviews/[assessmentId]/resend
 *
 * PR-S — resend the invite for an in-flight (SENT/IN_PROGRESS) assessment. Mints
 * a FRESH share link (the original is unrecoverable — only its hash is stored),
 * re-queues the invitation email, and returns the new link so the admin surface
 * can reveal it.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { resendAssessmentInvite } from '@/app-layer/usecases/vendor-assessment-send';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; assessmentId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await resendAssessmentInvite(ctx, params.assessmentId);
    return jsonResponse({
        assessmentId: result.assessmentId,
        externalAccessToken: result.externalAccessToken,
        expiresAt: result.expiresAt.toISOString(),
        notificationQueued: result.notificationQueued,
    });
});
