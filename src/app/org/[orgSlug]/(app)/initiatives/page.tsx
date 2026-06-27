import { notFound } from 'next/navigation';

import { getOrgCtx } from '@/app-layer/context';
import { listInitiatives } from '@/app-layer/usecases/org-security-initiative';
import { toPlainJson } from '@/lib/server/to-plain-json';
import { InitiativesClient } from './InitiativesClient';

export const dynamic = 'force-dynamic';

/**
 * Org-level security-initiatives (portfolio programmes). Cross-tenant
 * programme tracking — distinct from per-tenant Tasks. ORG_ADMIN manages;
 * any portfolio viewer reads.
 */
export default async function OrgInitiativesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params;
    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }
    const initiatives = await listInitiatives(ctx);
    return (
        <InitiativesClient
            orgSlug={orgSlug}
            canManage={ctx.permissions.canConfigureDashboard}
            initiatives={toPlainJson(
                initiatives.map((i) => ({
                    id: i.id,
                    title: i.title,
                    status: i.status,
                    ownerUserId: i.ownerUserId,
                    targetDate: i.targetDate?.toISOString() ?? null,
                    manualProgressPercent: i.manualProgressPercent,
                    linkCount: i.links.length,
                    tenantSpan: new Set(i.links.map((l) => l.linkedTenantId)).size,
                })),
            )}
        />
    );
}
