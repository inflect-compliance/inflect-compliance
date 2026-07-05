import { getTranslations } from 'next-intl/server';
import {
    SkeletonPageHeader,
    SkeletonDataTable,
} from '@/components/ui/skeleton';

/**
 * Issues loading skeleton — header + table.
 */
export default async function IssuesLoading() {
    const t = await getTranslations('issues');
    return (
        <div role="status" aria-live="polite" className="space-y-section animate-fadeIn" aria-busy="true" aria-label={t('loadingAria')}>
            <SkeletonPageHeader />
            <SkeletonDataTable rows={8} cols={7} />
        </div>
    );
}
