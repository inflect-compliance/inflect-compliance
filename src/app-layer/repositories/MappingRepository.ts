import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class MappingRepository {
    static async getControlsWithEvidence(db: PrismaTx, ctx: RequestContext) {
        // Evidence↔Control is a many-to-many join now; pull the linked
        // Evidence rows through it and flatten back to the `control.evidence`
        // array the readiness view iterates over.
        const controls = await db.control.findMany({
            where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
            include: {
                evidenceControlLinks: {
                    // Soft-deleted evidence must not reach the scorer at
                    // all — the in-memory qualifying predicate downstream
                    // checks it too, but excluding it here keeps the
                    // payload honest for every consumer of this shape.
                    where: { tenantId: ctx.tenantId, evidence: { deletedAt: null } },
                    include: { evidence: true },
                },
            },
        });
        return controls.map((c) => ({
            ...c,
            evidence: c.evidenceControlLinks.map((l) => l.evidence),
        }));
    }
}
