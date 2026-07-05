'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui/error-state';
import { Card } from '@/components/ui/card';

/**
 * Error boundary for the tenant-scoped app shell.
 *
 * Catches errors that occur inside any page within (app)/ — e.g. tasks,
 * controls, policies — and renders a recovery UI *inside* the sidebar layout.
 * Without this, errors bubble up to the root error.tsx, which unmounts
 * the entire app shell (leaving users on a blank page with no navigation).
 *
 * Architecture:
 *   root layout → [tenantSlug]/layout (server) → (app)/layout (client)
 *                                                  ↳ error.tsx  ← THIS FILE
 *   This sits below the sidebar / navbar but above page content.
 *
 * R11-PR3 — routes the page-level error chrome through the shared
 * `<ErrorState>` primitive so failures read consistently with in-card
 * error fallbacks (e.g. failed list fetches).
 */
export default function AppSectionError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations('common');

    useEffect(() => {
        console.error('[AppSectionError]', error);
    }, [error]);

    return (
        <div className="space-y-section animate-fadeIn">
            <Card className="max-w-xl mx-auto mt-12">
                <ErrorState
                    title={t('error.title')}
                    description={
                        <>
                            {t('error.body')}
                            {error.digest && (
                                <span className="block mt-2 text-xs font-mono text-content-subtle">
                                    {t('error.errorId', { id: error.digest })}
                                </span>
                            )}
                        </>
                    }
                    onRetry={() => reset()}
                    secondaryAction={{
                        label: t('error.goToDashboard'),
                        onClick: () => {
                            window.location.href = '/dashboard';
                        },
                    }}
                    data-testid="app-section-error"
                />
            </Card>
        </div>
    );
}
