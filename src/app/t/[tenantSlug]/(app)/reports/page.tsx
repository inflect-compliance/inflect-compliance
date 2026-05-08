import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { getReports } from '@/app-layer/usecases/report';
import { getSoA } from '@/app-layer/usecases/soa';
import prisma from '@/lib/prisma';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

/**
 * Reports — Server Component wrapper.
 * Fetches SoA report, risk register, and tenant controls server-side,
 * delegates interactive tabs and export to client island.
 */
export default async function ReportsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('reports'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);

    // Data fetches depend on ctx but are independent of each other
    const [data, soaReport, controls] = await Promise.all([
        getReports(ctx),
        getSoA(ctx, {
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        }),
        prisma.control.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, code: true, name: true, status: true },
            orderBy: { code: 'asc' },
        }),
    ]);

    return (
        <div className="space-y-section animate-fadeIn">
            <ReportsClient
                data={JSON.parse(JSON.stringify(data))}
                soaReport={JSON.parse(JSON.stringify(soaReport))}
                controls={JSON.parse(JSON.stringify(controls))}
                tenantSlug={tenantSlug}
                canEdit={ctx.permissions.canWrite}
                translations={{
                    title: t('title'),
                    subtitle: t('subtitle'),
                    exportSoa: t('exportSoa'),
                    exportRisks: t('exportRisks'),
                    soa: t('soa'),
                    riskRegister: t('riskRegister'),
                    control: t('control'),
                    name: t('name'),
                    applicable: t('applicable'),
                    status: t('status'),
                    evidence: t('evidence'),
                    overdue: t('overdue'),
                    risk: t('risk'),
                    asset: t('asset'),
                    threat: t('threat'),
                    score: t('score'),
                    treatment: t('treatment'),
                    owner: t('owner'),
                    controls: t('controls'),
                    yes: tc('yes'),
                    no: tc('no'),
                }}
            />
        </div>
    );
}
