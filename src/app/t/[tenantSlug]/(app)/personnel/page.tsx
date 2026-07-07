import { getTenantCtx } from '@/app-layer/context';
import { listEmployees } from '@/app-layer/usecases/personnel';
import { PersonnelClient, type EmployeeRow } from './PersonnelClient';

export const dynamic = 'force-dynamic';

/**
 * Personnel roster (PR-4) — Server Component. The people-layer hub. Lists
 * employees synced from an HRIS or entered manually.
 */
export default async function PersonnelPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listEmployees(ctx)) as unknown as EmployeeRow[];
    return <PersonnelClient initialRows={JSON.parse(JSON.stringify(rows))} tenantSlug={resolved.tenantSlug} />;
}
