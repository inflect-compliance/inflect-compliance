import { getTenantCtx } from '@/app-layer/context';
import { listTenantFrameworkDeltas } from '@/app-layer/usecases/framework-delta';

import { FrameworkUpdatesClient, type DeltaRow } from './FrameworkUpdatesClient';

/**
 * Framework updates (Epic Regwatch 2A). When a framework version lands in the
 * library, each affected tenant sees EXACTLY what changed and their new gap:
 * added requirements (new gaps), changed requirements (controls flagged for
 * re-review), removed requirements — plus actions.
 */
export default async function FrameworkUpdatesPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const deltas = await listTenantFrameworkDeltas(ctx, {});

    const rows: DeltaRow[] = deltas.map((d) => ({
        id: d.id,
        frameworkKey: d.frameworkKey,
        fromVersion: d.fromVersion,
        toVersion: d.toVersion,
        newGapCount: d.newGapCount,
        flaggedControlCount: d.flaggedControlCount,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        changelog: d.diff?.changelog ?? null,
        addedCodes: JSON.parse(d.diff?.addedCodesJson ?? '[]') as string[],
        changedCodes: JSON.parse(d.diff?.changedCodesJson ?? '[]') as string[],
        removedCodes: JSON.parse(d.diff?.removedCodesJson ?? '[]') as string[],
    }));

    return <FrameworkUpdatesClient tenantSlug={tenantSlug} initialDeltas={rows} />;
}
