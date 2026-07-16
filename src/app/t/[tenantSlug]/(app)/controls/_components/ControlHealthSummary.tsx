'use client';

/**
 * Control-health summary — the composite-verdict roll-up for the controls
 * dashboard. Reads the batched `/controls/health-verdicts` endpoint
 * (`counts` by verdict) and renders one labelled tile per verdict, reusing
 * the same verdict labels + StatusBadge variant map as the detail card and
 * the list Health column so the vocabulary reads as one system.
 *
 * A client island (the dashboard shell is otherwise fetch-on-mount) — it
 * self-fetches via `useTenantSWR` and shows a skeleton while loading, never
 * a permanent blank.
 */
import { useTranslations } from 'next-intl';

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/typography';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import {
    CONTROL_HEALTH_VERDICT_VARIANT,
    CONTROL_HEALTH_VERDICTS,
    type ControlHealthVerdict,
} from '@/lib/controls/control-health';

interface HealthVerdictSummary {
    counts: Record<ControlHealthVerdict, number>;
}

export function ControlHealthSummary() {
    const t = useTranslations('controls');
    const { data, isLoading } = useTenantSWR<HealthVerdictSummary>(
        '/controls/health-verdicts',
    );

    return (
        <Card>
            <Heading level={3} className="mb-4">{t('dashboard.controlHealthTitle')}</Heading>
            {isLoading && !data ? (
                <SkeletonCard lines={2} />
            ) : (
                <div className="grid grid-cols-2 gap-default md:grid-cols-5" id="control-health-summary">
                    {CONTROL_HEALTH_VERDICTS.map((verdict) => (
                        <div
                            key={verdict}
                            className="flex flex-col items-start gap-1.5 rounded-lg border border-border-subtle p-3"
                            data-verdict-tile={verdict}
                        >
                            <span className="text-xl font-semibold tabular-nums text-content-emphasis">
                                {data?.counts[verdict] ?? 0}
                            </span>
                            <StatusBadge size="sm" variant={CONTROL_HEALTH_VERDICT_VARIANT[verdict]}>
                                {t(`health.verdict.${verdict}` as Parameters<typeof t>[0])}
                            </StatusBadge>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
