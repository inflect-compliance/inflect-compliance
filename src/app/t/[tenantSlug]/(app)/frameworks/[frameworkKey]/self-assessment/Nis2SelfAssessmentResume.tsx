'use client';

import { useRouter } from 'next/navigation';

import { Nis2SelfAssessmentStep } from '@/components/onboarding/Nis2SelfAssessmentStep';
import { Heading } from '@/components/ui/typography';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantHref } from '@/lib/tenant-context-provider';

export function Nis2SelfAssessmentResume({
    tenantSlug,
    frameworkKey,
}: {
    tenantSlug: string;
    frameworkKey: string;
}) {
    const router = useRouter();
    const tenantHref = useTenantHref();
    const back = () => router.push(tenantHref(`/frameworks/${frameworkKey}`));

    return (
        <div className="space-y-section p-4">
            <div className="space-y-tight">
                <BackAffordance />
                <Heading level={1}>NIS2 self-assessment</Heading>
                <p className="text-content-muted text-sm">
                    Pick up where you left off. Answers save automatically.
                </p>
            </div>
            <Nis2SelfAssessmentStep tenantSlug={tenantSlug} onCompleted={back} />
        </div>
    );
}
