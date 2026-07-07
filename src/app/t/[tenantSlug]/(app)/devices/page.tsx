import { getTenantCtx } from '@/app-layer/context';
import { listDevices } from '@/app-layer/usecases/device';
import { DevicesClient, type DeviceRow } from './DevicesClient';

export const dynamic = 'force-dynamic';

/**
 * Device inventory (PR-5) — Server Component. Managed endpoints with per-device
 * posture. Devices are part of the people layer (personnel.view).
 */
export default async function DevicesPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listDevices(ctx)) as unknown as DeviceRow[];
    return <DevicesClient initialRows={JSON.parse(JSON.stringify(rows))} />;
}
