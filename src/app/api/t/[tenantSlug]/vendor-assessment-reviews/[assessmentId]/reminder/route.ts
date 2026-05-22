/**
 * POST /api/t/[tenantSlug]/vendor-assessment-reviews/[assessmentId]/reminder
 *
 * Re-queues a reminder email for an in-flight (SENT/IN_PROGRESS)
 * assessment. Same-day re-clicks dedupe via the outbox unique
 * constraint.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { sendAssessmentReminder } from '@/app-layer/usecases/vendor-assessment-reminder';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; assessmentId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await sendAssessmentReminder(ctx, params.assessmentId);
        return jsonResponse({
            notificationQueued: result.notificationQueued,
            expiresAt: result.expiresAt.toISOString(),
        });
    },
);
