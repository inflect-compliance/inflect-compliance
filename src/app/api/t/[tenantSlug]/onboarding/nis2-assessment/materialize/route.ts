import { getTenantCtx } from '@/app-layer/context';
import { materializeNis2Gaps } from '@/app-layer/usecases/nis2-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const MaterializeSchema = z
    .object({
        minCriticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        createTasks: z.boolean().optional(),
        dryRun: z.boolean().optional(),
    })
    .strip();

// POST → explicitly convert serious gaps to Findings (+ Tasks).
// Idempotent + reconciling. NEVER automatic. Mutation-tier rate-limited.
export const POST = withApiErrorHandling(
    withValidatedBody(
        MaterializeSchema,
        async (req, { params }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const ctx = await getTenantCtx(await params, req);
            const result = await materializeNis2Gaps(ctx, body);
            return jsonResponse(result);
        },
    ),
);
