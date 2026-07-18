import { RequestContext } from '../types';
import { ReportRepository } from '../repositories/ReportRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';
import { logger } from '@/lib/observability/logger';
import { traceUsecase } from '@/lib/observability/tracing';
import { canonicalTreatmentLabelEN } from '@/lib/risk-treatment-vocabulary';

/**
 * Risk-register report data — the flat, PDF-ready projection consumed by the
 * Risk Register PDF generator. It used to also compute an ISO-shaped `soa`
 * array, but the only consumer (the risk-register PDF) discarded it and the
 * SoA now lives entirely on its own surface (/reports/soa + the SoA CSV
 * export), so that computation is gone.
 */
export async function getReports(ctx: RequestContext) {
    assertCanRead(ctx);
    logger.info('report generation started', { component: 'report' });

    return traceUsecase('report.generate', ctx, () => runInTenantContext(ctx, async (db) => {
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
            component: 'report', riskCount: riskRegister.length,
        });

        return { riskRegister };
    }));
}
