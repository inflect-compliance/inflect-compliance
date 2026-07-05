import { getTranslations } from 'next-intl/server';
import { SkeletonPageHeader, SkeletonCard } from '@/components/ui/skeleton';

/** NIS2 gap-assessment respond page loading skeleton — header + question cards. */
export default async function Nis2RespondLoading() {
    const t = await getTranslations('audits');
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label={t('respond.loadingAria')}>
            <SkeletonPageHeader />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
        </div>
    );
}
