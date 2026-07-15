/**
 * POST /api/t/[tenantSlug]/vendor-assessment-templates/[templateId]/publish
 *
 * Flips a draft template to published. No request body. Authorization is
 * enforced in `publishTemplate` via
 * `assertCanManageVendorAssessmentTemplates(ctx)` — the same gate the
 * sibling clone / reorder / sections routes rely on. `vendor-assessment-
 * templates` is not a `requirePermission` privileged root (see
 * tests/guardrails/api-permission-coverage.test.ts), so the wrapper shape
 * mirrors its siblings exactly.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { publishTemplate } from '@/app-layer/usecases/vendor-assessment-template';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; templateId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await publishTemplate(ctx, params.templateId);
        return jsonResponse(result);
    },
);
