import { withApiErrorHandling } from '@/lib/errors/api';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { authorizeDeviceReport } from '@/lib/auth/device-token-auth';
import { reportDevice, DeviceReportSchema } from '@/app-layer/usecases/device';

/**
 * PR-5 — device-agent posture report. Authenticated by a per-tenant device
 * TOKEN (Authorization: Bearer icdt_…), NOT a user session — an endpoint agent
 * has no login. The token's tenant must match the URL slug. Upserts the device
 * by (tenantId, serialNumber).
 *
 * Not permission-gated (token IS the tenant credential) — the token verify +
 * tenant-slug match lives in `authorizeDeviceReport` so the route imports no
 * prisma. Excluded in api-permission-coverage with a written reason.
 */
export const POST = withApiErrorHandling<{ params: Promise<{ tenantSlug: string }> }>(async (req, { params }) => {
    const { tenantSlug } = await params;

    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const authed = await authorizeDeviceReport(token, tenantSlug, req.headers.get('x-forwarded-for'));
    if (!authed.ok || !authed.tenantId) {
        return jsonResponse({ error: authed.status === 403 ? 'forbidden' : 'unauthorized' }, { status: authed.status ?? 401 });
    }

    const body = await parseJsonBody(req, DeviceReportSchema);
    const device = await reportDevice(authed.tenantId, body);
    return jsonResponse({ id: device.id, serialNumber: device.serialNumber }, { status: 200 });
});
