/**
 * hris-sync jobs (PR-4).
 *
 *   - `hris-sync`          — sync ONE BambooHR connection's roster.
 *   - `hris-sync-dispatch` — daily fan-out: enqueue a sync per enabled HRIS
 *                            connection across tenants.
 *
 * The worker delegates to the tenant-scoped `runHrisSync` usecase. The
 * dispatcher reads only connection ids via global prisma (SharePoint pattern).
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/observability/logger';
import { enqueue } from './queue';
import { runHrisSync } from '@/app-layer/usecases/hris-sync';
import type { HrisSyncPayload } from './types';

const HRIS_PROVIDERS = ['bamboohr'];

export async function runHrisSyncJob(payload: HrisSyncPayload): Promise<{ executionId: string; status: string; upserted: number; managersLinked: number }> {
    if (!payload.tenantId || !payload.connectionId) throw new Error('hris-sync requires tenantId + connectionId');
    const r = await runHrisSync({ tenantId: payload.tenantId, connectionId: payload.connectionId });
    return { executionId: r.executionId, status: r.status, upserted: r.upserted, managersLinked: r.managersLinked };
}

export async function runHrisSyncDispatch(): Promise<{ connections: number; dispatched: number }> {
    const connections = await prisma.integrationConnection.findMany({
        where: { provider: { in: HRIS_PROVIDERS }, isEnabled: true },
        select: { id: true, tenantId: true },
        take: 1000,
    });
    let dispatched = 0;
    for (const conn of connections) {
        await enqueue('hris-sync', { tenantId: conn.tenantId, connectionId: conn.id });
        dispatched++;
    }
    logger.info('hris-sync-dispatch complete', { component: 'hris-sync', connections: connections.length, dispatched });
    return { connections: connections.length, dispatched };
}
