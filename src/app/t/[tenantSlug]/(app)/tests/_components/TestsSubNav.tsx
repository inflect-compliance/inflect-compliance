'use client';

/**
 * R3-P3 — one sub-nav for the three test surfaces. They were previously
 * linked only by ad-hoc icon buttons scattered per page (some text, some
 * bare icons), with no consistent way to move between them or see which one
 * you were on. This is the single spine:
 *   • Tests      — the plan catalogue (manage plans + automated checks)
 *   • Due        — the execution queue (run what's due / overdue)
 *   • Dashboard  — analytics (rates, trends, framework test coverage)
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantHref } from '@/lib/tenant-context-provider';
import { cn } from '@/lib/cn';

type TabKey = 'tests' | 'due' | 'dashboard';

export function TestsSubNav({ active, className }: { active: TabKey; className?: string }) {
    const t = useTranslations('controlTests');
    const tenantHref = useTenantHref();
    const pathname = usePathname();

    const tabs: Array<{ key: TabKey; href: string; label: string }> = [
        { key: 'tests', href: tenantHref('/tests'), label: t('subnav.tests') },
        { key: 'due', href: tenantHref('/tests/due'), label: t('subnav.due') },
        { key: 'dashboard', href: tenantHref('/tests/dashboard'), label: t('subnav.dashboard') },
    ];

    return (
        <nav aria-label={t('subnav.aria')} id="tests-subnav" className={cn('flex gap-1 border-b border-border-subtle', className)}>
            {tabs.map((tab) => {
                const isActive = tab.key === active || pathname === tab.href;
                return (
                    <Link
                        key={tab.key}
                        href={tab.href}
                        aria-current={isActive ? 'page' : undefined}
                        id={`tests-subnav-${tab.key}`}
                        className={cn(
                            'px-3 py-2 text-sm -mb-px border-b-2 transition-colors',
                            isActive
                                ? 'border-[var(--brand-default)] text-content-emphasis font-medium'
                                : 'border-transparent text-content-muted hover:text-content-default',
                        )}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </nav>
    );
}
