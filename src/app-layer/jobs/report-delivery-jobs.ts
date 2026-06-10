/**
 * RQ-10 — scheduled report delivery cron (cross-tenant fan-out).
 *
 * Finds due ReportSchedules, generates the report, and advances nextRunAt.
 * Email/SharePoint delivery of the generated artefact rides the existing
 * outbound pipelines (logged here; wired in a follow-up).
 *
 * @module jobs/report-delivery-jobs
 */
import prisma from '@/lib/prisma';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';
import { generateReport, computeNextRun, type ReportFormat } from '@/app-layer/usecases/risk-report';
import { logger } from '@/lib/observability/logger';
import type { ReportDeliveryPayload } from './types';

async function buildCtx(tenantId: string): Promise<RequestContext | null> {
    const admin = await prisma.tenantMembership.findFirst({
        where: { tenantId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true, role: true }, orderBy: { createdAt: 'asc' },
    });
    if (!admin) return null;
    const appPermissions = getPermissionsForRole(admin.role);
    return {
        requestId: `report-delivery-${tenantId}`, userId: admin.userId, tenantId, role: admin.role,
        permissions: {
            canRead: appPermissions.risks.view, canWrite: appPermissions.risks.edit,
            canAdmin: appPermissions.admin.manage, canAudit: appPermissions.audits.view, canExport: appPermissions.reports.export,
        },
        appPermissions,
    };
}

export async function runReportDelivery(_payload: ReportDeliveryPayload) {
    const now = new Date();
    const due = await prisma.reportSchedule.findMany({
        where: { isActive: true, nextRunAt: { lte: now } },
        select: { id: true, tenantId: true, templateId: true, format: true, cadence: true, parametersJson: true, recipientsJson: true },
        take: 1000,
    });
    let generated = 0, failed = 0;
    for (const s of due) {
        const ctx = await buildCtx(s.tenantId);
        if (!ctx) continue;
        try {
            await generateReport(ctx, s.templateId, (s.parametersJson ?? {}) as Record<string, unknown>, (s.format as ReportFormat) ?? 'PDF');
            generated++;
            logger.info('report-delivery: generated scheduled report', {
                component: 'report-delivery', tenantId: s.tenantId, scheduleId: s.id,
                recipients: Array.isArray(s.recipientsJson) ? (s.recipientsJson as unknown[]).length : 0,
            });
        } catch (err) {
            failed++;
            logger.warn('report-delivery: scheduled generation failed', {
                component: 'report-delivery', tenantId: s.tenantId, scheduleId: s.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        await prisma.reportSchedule.update({
            where: { id: s.id },
            data: { lastRunAt: now, nextRunAt: computeNextRun(s.cadence, now) },
        });
    }
    return { due: due.length, generated, failed };
}
