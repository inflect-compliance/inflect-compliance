/**
 * P2 — lightweight risk option list for pickers.
 *
 * The risk-analytics create forms (scenarios overrides, KRI, loss-events,
 * hierarchy links) all need to attach their record to a real Risk. They
 * share this one `{ id, title }` projection instead of pulling the full
 * (heavy, paginated) risk list. Tenant-scoped + read-gated; capped at 500
 * like the correlation picker.
 *
 * @module usecases/risk-picker
 */
import type { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead } from '../policies/common';

export interface RiskOption {
    id: string;
    title: string;
}

export async function listRiskOptions(ctx: RequestContext): Promise<RiskOption[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.risk.findMany({
            where: { tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
            take: 500,
        }),
    );
}
