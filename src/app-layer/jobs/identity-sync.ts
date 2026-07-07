/**
 * identity-sync jobs (PR-2).
 *
 *   - `identity-sync`          — sync ONE Okta / Google Workspace connection.
 *   - `identity-sync-dispatch` — daily fan-out: enqueue a sync for every
 *                                enabled identity connection across tenants.
 *
 * The per-connection worker delegates to the tenant-scoped
 * `runIdentitySync` usecase (no global prisma there). The dispatcher reads
 * only connection ids (not tenant content) via global prisma, mirroring
 * `sharepoint-delta-sync-dispatch`.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/observability/logger';
import { enqueue } from './queue';
import { runIdentitySync } from '@/app-layer/usecases/identity-sync';
import type { IdentitySyncPayload } from './types';

const IDENTITY_PROVIDERS = ['okta', 'google-workspace'];

export async function runIdentitySyncJob(payload: IdentitySyncPayload): Promise<{
    executionId: string;
    status: string;
    upserted: number;
    deprovisioned: number;
}> {
    if (!payload.tenantId || !payload.connectionId) {
        throw new Error('identity-sync requires tenantId + connectionId');
    }
    const r = await runIdentitySync({ tenantId: payload.tenantId, connectionId: payload.connectionId });
    return { executionId: r.executionId, status: r.status, upserted: r.upserted, deprovisioned: r.deprovisioned };
}

/** Fan-out: one identity-sync per enabled Okta / Google Workspace connection. */
export async function runIdentitySyncDispatch(): Promise<{ connections: number; dispatched: number }> {
    const connections = await prisma.integrationConnection.findMany({
        where: { provider: { in: IDENTITY_PROVIDERS }, isEnabled: true },
        select: { id: true, tenantId: true },
        take: 1000,
    });

    let dispatched = 0;
    for (const conn of connections) {
        await enqueue('identity-sync', { tenantId: conn.tenantId, connectionId: conn.id });
        dispatched++;
    }
    logger.info('identity-sync-dispatch complete', { component: 'identity-sync', connections: connections.length, dispatched });
    return { connections: connections.length, dispatched };
}
