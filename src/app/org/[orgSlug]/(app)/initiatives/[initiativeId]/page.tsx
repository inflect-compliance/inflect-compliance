import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { getInitiative, getInitiativeProgress } from '@/app-layer/usecases/org-security-initiative';
import { toPlainJson } from '@/lib/server/to-plain-json';
import { InitiativeDetailClient } from './InitiativeDetailClient';

export const dynamic = 'force-dynamic';

export default async function OrgInitiativeDetailPage({
    params,
}: {
    params: Promise<{ orgSlug: string; initiativeId: string }>;
}) {
    const { orgSlug, initiativeId } = await params;
    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }
    let initiative;
    try {
        initiative = await getInitiative(ctx, initiativeId);
    } catch {
        notFound();
    }
    const progress = await getInitiativeProgress(initiative);

    return (
        <InitiativeDetailClient
            orgSlug={orgSlug}
            canManage={ctx.permissions.canConfigureDashboard}
            initiative={toPlainJson({
                id: initiative.id,
                title: initiative.title,
                description: initiative.description,
                status: initiative.status,
                ownerUserId: initiative.ownerUserId,
                targetDate: initiative.targetDate?.toISOString() ?? null,
                manualProgressPercent: initiative.manualProgressPercent,
                links: initiative.links.map((l) => ({
                    id: l.id,
                    linkedTenantId: l.linkedTenantId,
                    entityType: l.entityType,
                    entityId: l.entityId,
                })),
            })}
            progress={toPlainJson(progress)}
        />
    );
}
