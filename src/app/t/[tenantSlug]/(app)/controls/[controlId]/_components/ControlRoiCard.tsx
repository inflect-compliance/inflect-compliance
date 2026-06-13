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

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantContext } from '@/lib/tenant-context-provider';
import { formatCompactCurrency } from '@/lib/risk-coherence';
import { describeRoiGap, type ControlRoiVerdict } from '@/lib/control-roi';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { SkeletonCard } from '@/components/ui/skeleton';

interface RoiPayload {
    controlId: string;
    code: string | null;
    name: string;
    annualCost: number | null;
    effectiveness: number | null;
    verdict: ControlRoiVerdict;
}

export function ControlRoiCard({ controlId }: { controlId: string }) {
    const { currencySymbol } = useTenantContext();
    const sym = currencySymbol ?? '€';
    const { data, error, isLoading } = useTenantSWR<RoiPayload>(`/controls/${controlId}/roi`);

    if (isLoading || !data) {
        if (error) return null;
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
                <span className="text-xs text-content-subtle uppercase">Mitigation ROI</span>
            </div>
            {verdict.ok ? (
                <div className="space-y-default">
                    <p className="text-sm text-content-default" data-testid="control-roi-headline">
                        Reduces expected loss by{' '}
                        <strong>{formatCompactCurrency(verdict.value.aleProtected, sym)}/yr</strong>{' '}
                        on{' '}
                        <strong>{formatCompactCurrency(annualCost, sym)}/yr</strong>{' '}
                        spend —{' '}
                        <strong data-testid="control-roi-multiple">
                            {verdict.value.roiMultiple.toFixed(1)}×
                        </strong>{' '}
                        ROI.
                    </p>
                    <p className="text-xs text-content-subtle">
                        Across{' '}
                        {verdict.value.quantifiedRiskCount} of {verdict.value.linkedRiskCount}{' '}
                        linked {verdict.value.linkedRiskCount === 1 ? 'risk' : 'risks'} with a quantified ALE,
                        priced at {effectiveness}% declared effectiveness.
                    </p>
                </div>
            ) : (
                <div className="space-y-default">
                    <p className="text-sm text-content-warning" data-testid="control-roi-gap">
                        {describeRoiGap(verdict)}
                    </p>
                    <p className="text-xs text-content-subtle">
                        ROI is null on purpose — the model never invents a number from missing inputs.
                    </p>
                </div>
            )}
        </div>
    );
}
