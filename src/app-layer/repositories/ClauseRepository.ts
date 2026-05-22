import prisma from '@/lib/prisma';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { getISO27001Clauses } from '@/app-layer/libraries';
import { ClauseStatus } from '@prisma/client';

export class ClauseRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        const CLAUSES = getISO27001Clauses();
        // Ensure clauses exist in DB (global table — uses global prisma since Clause has no tenantId)
        for (const c of CLAUSES) {
            await prisma.clause.upsert({
                where: { number: c.number },
                create: { number: c.number, title: c.title, description: c.description, artifacts: c.artifacts, sortOrder: parseInt(c.number) },
                update: {},
            });
        }

        // Clause is global (no RLS), but ClauseProgress is tenant-scoped — read via tenant tx
        const clauses = await prisma.clause.findMany({ orderBy: { sortOrder: 'asc' } });
        const progress = await db.clauseProgress.findMany({ where: { tenantId: ctx.tenantId } });

        return clauses.map((clause) => {
            const p = progress.find((pr) => pr.clauseId === clause.id);
            const clauseInfo = CLAUSES.find((c) => c.number === clause.number);
            return {
                ...clause,
                status: p?.status || 'NOT_STARTED',
                notes: p?.notes || '',
                checklist: clauseInfo?.checklist || [],
                progressId: p?.id,
            };
        });
    }

    static async updateProgress(db: PrismaTx, ctx: RequestContext, clauseId: string, data: { status: string; notes?: string | null }) {
        return db.clauseProgress.upsert({
            where: {
                tenantId_clauseId: { tenantId: ctx.tenantId, clauseId },
            },
            create: {
                tenantId: ctx.tenantId,
                clauseId,
                status: data.status as ClauseStatus,
                notes: data.notes || '',
            },
            update: {
                status: data.status as ClauseStatus,
                notes: data.notes || '',
            },
        });
    }
}
