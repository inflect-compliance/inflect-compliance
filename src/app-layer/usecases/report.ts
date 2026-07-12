import { RequestContext } from '../types';
import { ReportRepository } from '../repositories/ReportRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { logger } from '@/lib/observability/logger';
import { traceUsecase } from '@/lib/observability/tracing';
import { canonicalTreatmentLabelEN } from '@/lib/risk-treatment-vocabulary';

export async function getReports(ctx: RequestContext) {
    assertCanRead(ctx);
    logger.info('report generation started', { component: 'report' });

    return traceUsecase('report.generate', ctx, () => runInTenantContext(ctx, async (db) => {
        const controls = await ReportRepository.getSOAData(db, ctx);

        const soa = controls.map((c) => ({
            controlId: c.annexId || c.id,
            name: c.name,
            applicable: c.applicability === 'APPLICABLE',
            status: c.status,
            effectiveness: c.effectiveness,
            evidenceCount: c.evidence.length,
            approvedEvidence: c.evidence.filter((e) => e.status === 'APPROVED').length,
            hasOverdue: c.evidence.some((e) => e.nextReviewDate && new Date(e.nextReviewDate) < new Date()),
            lastTested: c.lastTested,
            reviewCadence: c.reviewCadence,
        }));

        const risks = await ReportRepository.getRiskRegisterData(db, ctx);

        const riskRegister = risks.map((r) => ({
            id: r.id,
            title: r.title,
            threat: r.threat,
            vulnerability: r.vulnerability,
            likelihood: r.likelihood,
            impact: r.impact,
            score: r.inherentScore,
            treatment: canonicalTreatmentLabelEN(r.treatment) || 'Untreated',
            owner: r.treatmentOwner || 'Unassigned',
            targetDate: r.targetDate,
            controls: r.controls.map((rc: { control: { annexId: string | null; name: string } }) => rc.control.annexId || rc.control.name).join(', '),
        }));

        logger.info('report generation completed', {
            component: 'report', soaCount: soa.length, riskCount: riskRegister.length,
        });

        return { soa, riskRegister };
    }));
}
