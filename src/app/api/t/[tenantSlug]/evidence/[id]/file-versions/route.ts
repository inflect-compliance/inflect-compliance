/**
 * GET /api/t/[tenantSlug]/evidence/[id]/file-versions
 *
 * The evidence row's file-version lineage, newest first. The chain has
 * always been written by `replaceEvidenceFile` (each new FileRecord points
 * at the one it superseded) but was never readable, so a user who replaced
 * a file had no way to see that v2 existed or to retrieve v1.
 *
 * Each entry carries the FileRecord id — prior versions download through
 * the existing `/evidence/files/[fileId]/download` route, which re-applies
 * the tenant path guard and the AV-scan gate.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getEvidenceFileVersions } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await getEvidenceFileVersions(ctx, params.id));
});
