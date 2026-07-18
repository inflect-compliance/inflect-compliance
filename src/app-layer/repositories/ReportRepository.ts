import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class ReportRepository {
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
