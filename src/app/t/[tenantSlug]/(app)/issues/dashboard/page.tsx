'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantHref } from '@/lib/tenant-context-provider';

/** Legacy redirect: /issues/dashboard → /tasks (TP-7 retired the
 *  standalone Tasks dashboard; the list carries the KPI strip now). */
export default function IssueDashboardRedirect() {
    const t = useTranslations('issues');
    const router = useRouter();
    const tenantHref = useTenantHref();
    useEffect(() => { router.replace(tenantHref('/tasks')); }, [router, tenantHref]);
    return <div className="p-12 text-center text-content-subtle animate-pulse">{t('redirecting')}</div>;
}
