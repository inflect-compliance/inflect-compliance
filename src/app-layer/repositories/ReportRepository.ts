import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class ReportRepository {
    static async getSOAData(db: PrismaTx, ctx: RequestContext) {
        // Evidence↔Control is a many-to-many join now; pull the linked
        // Evidence rows through it and flatten back to the `control.evidence`
        // array the SoA report iterates over.
        const controls = await db.control.findMany({
            where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
            orderBy: { annexId: 'asc' },
            include: {
                evidenceControlLinks: {
                    where: { tenantId: ctx.tenantId },
                    include: { evidence: true },
                },
            },
        });
        return controls.map((c) => ({
            ...c,
            evidence: c.evidenceControlLinks.map((l) => l.evidence),
        }));
    }

    static async getRiskRegisterData(db: PrismaTx, ctx: RequestContext) {
        return db.risk.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { inherentScore: 'desc' },
            include: {
                controls: { include: { control: { select: { name: true, annexId: true } } } },
            },
        });
    }
}
