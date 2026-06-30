import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listInstallableFrameworks } from '@/app-layer/usecases/framework';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// The onboarding Frameworks step renders one card per installable framework
// (every framework that ships a control pack). Data-driven so the picker
// tracks the catalog automatically instead of a hand-maintained list.
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) => {
    const ctx = await getTenantCtx(await params, req);
    const frameworks = await listInstallableFrameworks(ctx);
    return jsonResponse(frameworks);
});
