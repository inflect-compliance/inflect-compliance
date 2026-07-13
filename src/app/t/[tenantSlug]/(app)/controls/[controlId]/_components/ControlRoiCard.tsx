/**
 * RQ3-8 — Control ROI summary card (control detail overview).
 *
 * Reads `/controls/:id/roi` and renders one of:
 *
 *   - ok verdict → "this control buys €X reduction for €Y/yr
 *     (ROI Z×)", with the per-risk count callout;
 *   - gap verdict → a typed, plain-English nudge ("Set an annual
 *     cost…" / "Quantify the linked risks…") — never a fabricated
 *     zero.
 *
 * The card mounts independently of the page-data SWR cache so the
 * verdict reflects link-add / unlink updates without forcing a
 * full page re-render.
 */
'use client';

import { useTranslations } from 'next-intl';

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantContext } from '@/lib/tenant-context-provider';
import { formatCompactCurrency } from '@/lib/risk-coherence';
import { describeRoiGap, type ControlRoiVerdict } from '@/lib/control-roi';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { SkeletonCard } from '@/components/ui/skeleton';
import { InlineNotice } from '@/components/ui/inline-notice';

interface RoiPayload {
    controlId: string;
    code: string | null;
    name: string;
    annualCost: number | null;
    effectiveness: number | null;
    verdict: ControlRoiVerdict;
}

export function ControlRoiCard({ controlId }: { controlId: string }) {
    const tx = useTranslations('controls');
    const { currencySymbol } = useTenantContext();
    const sym = currencySymbol ?? '€';
    const { data, error, isLoading, mutate } = useTenantSWR<RoiPayload>(`/controls/${controlId}/roi`);

    // R2-P4 — surface a load failure with a retry instead of returning null
    // (a silent disappearance the user can't recover from).
    if (error && !data) {
        return (
            <InlineNotice variant="error" data-testid="control-roi-card-error">
                {tx('roi.loadError')}{' '}
                <button type="button" className="underline hover:no-underline" onClick={() => void mutate()}>
                    {tx('roi.retry')}
                </button>
            </InlineNotice>
        );
    }

    if (isLoading || !data) {
        return (
            <div className={cn(cardVariants(), 'space-y-default')} data-testid="control-roi-card-loading">
                <SkeletonCard lines={2} />
            </div>
        );
    }

    const { verdict, annualCost, effectiveness } = data;

    return (
        <div
            className={cn(cardVariants(), 'space-y-default')}
            data-testid="control-roi-card"
        >
            <div>
                <span className="text-xs text-content-subtle uppercase">{tx('roi.eyebrow')}</span>
            </div>
            {verdict.ok ? (
                <div className="space-y-default">
                    <p className="text-sm text-content-default" data-testid="control-roi-headline">
                        {tx.rich('roi.headline', {
                            ale: `${formatCompactCurrency(verdict.value.aleProtected, sym)}/yr`,
                            cost: `${formatCompactCurrency(annualCost, sym)}/yr`,
                            roi: verdict.value.roiMultiple.toFixed(1),
                            b: (chunks) => <strong>{chunks}</strong>,
                            m: (chunks) => (
                                <strong data-testid="control-roi-multiple">{chunks}</strong>
                            ),
                        })}
                    </p>
                    <p className="text-xs text-content-subtle">
                        {tx(
                            verdict.value.linkedRiskCount === 1
                                ? 'roi.sublineOne'
                                : 'roi.sublineOther',
                            {
                                quantified: verdict.value.quantifiedRiskCount,
                                linked: verdict.value.linkedRiskCount,
                                effectiveness: effectiveness ?? '',
                            },
                        )}
                    </p>
                </div>
            ) : (
                <div className="space-y-default">
                    <p className="text-sm text-content-warning" data-testid="control-roi-gap">
                        {describeRoiGap(verdict)}
                    </p>
                    <p className="text-xs text-content-subtle">
                        {tx('roi.gapSubline')}
                    </p>
                </div>
            )}
        </div>
    );
}
