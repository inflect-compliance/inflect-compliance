'use client';

/**
 * P3 — shared load/error/empty state for the risk-analytics pages.
 *
 * The analytics pages used raw `fetch(...).catch(() => {})`, so a load
 * failure rendered as an empty register indistinguishable from a genuinely
 * empty tenant. This standardises the three honest states — skeleton while
 * loading, a visible error on failure, a typed empty state — so no page
 * ever shows a blank card on a failed load. Wrap the LIST body only; the
 * create form above stays usable.
 */
import { type ReactNode } from 'react';
import { SkeletonCard } from '@/components/ui/skeleton';
import { InlineNotice } from '@/components/ui/inline-notice';

export function AnalyticsState({
    isLoading,
    error,
    isEmpty,
    emptyText,
    errorText,
    skeletonLines = 4,
    children,
}: {
    isLoading: boolean;
    error: unknown;
    isEmpty: boolean;
    emptyText: string;
    errorText: string;
    skeletonLines?: number;
    children: ReactNode;
}) {
    if (error) {
        return (
            <InlineNotice variant="error" data-testid="analytics-error">
                {errorText}
            </InlineNotice>
        );
    }
    if (isLoading) {
        return <SkeletonCard lines={skeletonLines} />;
    }
    if (isEmpty) {
        return <p className="text-sm text-content-muted">{emptyText}</p>;
    }
    return <>{children}</>;
}
