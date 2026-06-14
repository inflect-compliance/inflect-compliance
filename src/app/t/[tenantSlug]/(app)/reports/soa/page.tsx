import { getTenantCtx } from '@/app-layer/context';
import { getSoA } from '@/app-layer/usecases/soa';
import { SoAClient } from './SoAClient';
import { BackAffordance } from '@/components/nav/BackAffordance';

export const dynamic = 'force-dynamic';

export default async function SoAPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const report = await getSoA(ctx, {
        includeEvidence: true,
        includeTasks: true,
        includeTests: true,
    });

    // Load tenant controls for the "Map control" modal
    const controls = await import('@/lib/prisma').then(m => m.default.control.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { code: 'asc' },
    }));

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <SoAClient
                report={JSON.parse(JSON.stringify(report))}
                controls={JSON.parse(JSON.stringify(controls))}
                tenantSlug={tenantSlug}
                canEdit={ctx.permissions.canWrite}
            />
        </div>
    );
}
