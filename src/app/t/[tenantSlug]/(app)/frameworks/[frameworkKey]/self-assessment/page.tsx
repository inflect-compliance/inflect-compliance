import { getTenantCtx } from '@/app-layer/context';
import { Nis2SelfAssessmentResume } from './Nis2SelfAssessmentResume';

export const dynamic = 'force-dynamic';

/**
 * Resume-later surface for the NIS2 self-assessment. Onboarding is the
 * FIRST entry point, not the only one — a tenant who skipped the step (or
 * finished onboarding) returns here to continue the same assessment.
 * Only meaningful for the NIS2 framework.
 */
export default async function FrameworkSelfAssessmentPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; frameworkKey: string }>;
}) {
    const { tenantSlug, frameworkKey } = await params;
    // Ensure tenant access (throws/redirects on mismatch).
    await getTenantCtx({ tenantSlug });

    if (frameworkKey.toUpperCase() !== 'NIS2') {
        return (
            <div className="p-6">
                <p className="text-content-muted text-sm">
                    The gap self-assessment is only available for the NIS2 framework.
                </p>
            </div>
        );
    }

    return <Nis2SelfAssessmentResume tenantSlug={tenantSlug} frameworkKey={frameworkKey} />;
}
