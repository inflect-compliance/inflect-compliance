import { getVendor, updateVendor } from '@/app-layer/usecases/vendor';
import { UpdateVendorSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type VendorDetailParams = { tenantSlug: string; vendorId: string };

export const GET = withApiErrorHandling(requirePermission<VendorDetailParams>('vendors.view', async (_req, { params }, ctx) => {
    const { vendorId } = await params;
    const vendor = await getVendor(ctx, vendorId);
    return jsonResponse(vendor);
}));

export const PATCH = withApiErrorHandling(requirePermission<VendorDetailParams>('vendors.edit', async (req, { params }, ctx) => {
    const { vendorId } = await params;
    const body = await parseJsonBody(req, UpdateVendorSchema);
    const vendor = await updateVendor(ctx, vendorId, body);
    return jsonResponse(vendor);
}));
