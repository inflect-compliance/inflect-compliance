import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { PolicyContentType } from '@prisma/client';

export class PolicyVersionRepository {
    static async create(db: PrismaTx, ctx: RequestContext, policyId: string, data: {
        contentType: string;
        contentText?: string | null;
        externalUrl?: string | null;
        changeSummary?: string | null;
    }) {
        // Auto-increment version number
        const latest = await db.policyVersion.findFirst({
            where: { policyId },
            orderBy: { versionNumber: 'desc' },
        });
        const nextVersion = (latest?.versionNumber ?? 0) + 1;

        return db.policyVersion.create({
            data: {
                tenantId: ctx.tenantId,
                policyId,
                versionNumber: nextVersion,
                contentType: data.contentType as PolicyContentType,
                contentText: data.contentText,
                externalUrl: data.externalUrl,
                changeSummary: data.changeSummary,
                createdById: ctx.userId,
            },
            include: {
                createdBy: { select: { id: true, name: true } },
            },
        });
    }

    static async listByPolicy(db: PrismaTx, ctx: RequestContext, policyId: string) {
        return db.policyVersion.findMany({
            where: { policyId },
            orderBy: { versionNumber: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { approvals: true, acknowledgements: true } },
            },
        });
    }

    static async getById(db: PrismaTx, id: string) {
        return db.policyVersion.findUnique({
            where: { id },
            include: {
                policy: { select: { id: true, tenantId: true, title: true } },
                createdBy: { select: { id: true, name: true } },
            },
        });
    }
}
