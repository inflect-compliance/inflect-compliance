import { redirect } from 'next/navigation';
import { getTenantCtx } from '@/app-layer/context';
import { getSoA } from '@/app-layer/usecases/soa';
import { SoAPrintView } from './SoAPrintView';

export const dynamic = 'force-dynamic';

/**
 * Print-optimized SoA page — no nav, clean layout, CSS print styles.
 * Users click "Print / Save as PDF" in their browser.
 */
export default async function SoAPrintPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<{ framework?: string }>;
}) {
    const { tenantSlug } = await params;
    // Honor the framework forwarded by the SoA "Print" affordance.
    const { framework } = await searchParams;
    const ctx = await getTenantCtx({ tenantSlug });

    // Independent fetches — run in parallel
    const [report, tenant] = await Promise.all([
        getSoA(ctx, {
            framework,
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        }),
        import('@/lib/prisma').then(m =>
            m.default.tenant.findUnique({
                where: { id: ctx.tenantId },
                select: { name: true },
            })
        ),
    ]);

    // Same ISO-only guard as the interactive SoA page — the print view is a
    // Statement of Applicability, which a non-ISO framework doesn't have.
    if (!report.isIsoFamily) {
        redirect(`/t/${tenantSlug}/reports`);
    }

    return (
        <SoAPrintView
            report={JSON.parse(JSON.stringify(report))}
            tenantName={tenant?.name || tenantSlug}
        />
    );
}
