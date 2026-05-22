/**
 * Evidence retention sweep job.
 * Finds evidence with retentionUntil < now and not archived,
 * flags expiredAt if null, sets isArchived=true, emits events.
 * Idempotent: re-running does not re-update already archived items.
 *
 * Usage (cron):
 *   import { runEvidenceRetentionSweep } from '@/app-layer/jobs/retention';
 *   await runEvidenceRetentionSweep({ tenantId: 'xxx' });          // single tenant
 *   await runEvidenceRetentionSweep({ now: new Date() });          // all tenants
 *   await runEvidenceRetentionSweep({ dryRun: true });             // preview
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runJob } from '@/lib/observability/job-runner';
import { logger } from '@/lib/observability/logger';

export interface RetentionSweepOptions {
    tenantId?: string;
    now?: Date;
    dryRun?: boolean;
}

export interface RetentionSweepResult {
    scanned: number;
    expired: number;
    archived: number;
    dryRun: boolean;
}

export async function runEvidenceRetentionSweep(
    options: RetentionSweepOptions = {},
): Promise<RetentionSweepResult> {
    return runJob('retention-sweep', async () => {
        const now = options.now ?? new Date();
        const dryRun = options.dryRun ?? false;

        // Find evidence with retentionUntil < now AND not already archived AND not soft-deleted
        const where: Prisma.EvidenceWhereInput = {
            retentionUntil: { not: null, lt: now },
            isArchived: false,
            deletedAt: null,
        };
        if (options.tenantId) {
            where.tenantId = options.tenantId;
        }

        const candidates = await prisma.evidence.findMany({
            where,
            select: { id: true, tenantId: true, title: true, expiredAt: true },
        });

        const scanned = candidates.length;
        let expired = 0;
        let archived = 0;

        if (dryRun) {
            logger.info('retention sweep dry run', { component: 'job', scanned });
            return { scanned, expired: scanned, archived: scanned, dryRun: true };
        }

        for (const ev of candidates) {
            const updateData: Prisma.EvidenceUpdateInput = {
                isArchived: true,
            };

            // Only set expiredAt if not already set (idempotent)
            if (!ev.expiredAt) {
                updateData.expiredAt = now;
                expired++;
            }

            archived++;

            await prisma.evidence.update({
                where: { id: ev.id },
                data: updateData,
            });

            // Emit audit events
            await prisma.auditLog.createMany({
                data: [
                    ...(!ev.expiredAt ? [{
                        tenantId: ev.tenantId,
                        entity: 'Evidence',
                        entityId: ev.id,
                        action: 'EVIDENCE_EXPIRED',
                        details: JSON.stringify({ title: ev.title, expiredAt: now.toISOString() }),
                    }] : []),
                    {
                        tenantId: ev.tenantId,
                        entity: 'Evidence',
                        entityId: ev.id,
                        action: 'EVIDENCE_ARCHIVED',
                        details: JSON.stringify({ title: ev.title, archivedAt: now.toISOString(), reason: 'retention_expired' }),
                    },
                ],
            });
        }

        logger.info('retention sweep completed', { component: 'job', scanned, expired, archived });
        return { scanned, expired, archived, dryRun: false };
    }, { tenantId: options.tenantId });
}
