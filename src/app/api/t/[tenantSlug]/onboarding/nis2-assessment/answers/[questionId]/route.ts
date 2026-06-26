import { getTenantCtx } from '@/app-layer/context';
import { saveNis2Answer } from '@/app-layer/usecases/onboarding-nis2';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';
import { NIS2_ANSWER } from '@/lib/schemas/nis2-gap-assessment';

const AnswerBodySchema = z
    .object({
        answer: z.enum(NIS2_ANSWER),
        note: z.string().max(4000).nullish(),
    })
    .strip();

// PUT → autosave one answer. questionId from the path; mutation-tier
// rate-limited (withApiErrorHandling default on PUT).
export const PUT = withApiErrorHandling(
    withValidatedBody(
        AnswerBodySchema,
        async (
            req,
            { params }: { params: Promise<{ tenantSlug: string; questionId: string }> },
            body,
        ) => {
            const { questionId, ...rest } = await params;
            const ctx = await getTenantCtx(rest, req);
            const saved = await saveNis2Answer(ctx, {
                questionId,
                answer: body.answer,
                note: body.note ?? null,
            });
            return jsonResponse({ id: saved.id, questionId, answer: saved.answer });
        },
    ),
);
