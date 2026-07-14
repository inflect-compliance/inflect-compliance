import { getTranslations } from 'next-intl/server';
import { getTenantCtx } from '@/app-layer/context';
import { listEvidence, getEvidenceRetentionMetrics } from '@/app-layer/usecases/evidence';
import { listControls } from '@/app-layer/usecases/control';
import { EvidenceClient } from './EvidenceClient';

export const dynamic = 'force-dynamic';

// SSR fetch caps at SSR_PAGE_LIMIT rows for both evidence and the
// supporting controls list (used to populate filters / dropdowns).
// The Epic 69 SWR client immediately fetches the unbounded list in
// the background, swapped in by SWR's keepPreviousData. Mirrors
// the PR #146 Tasks pattern.
const SSR_PAGE_LIMIT = 100;

/**
 * Evidence — Server Component wrapper.
 * Fetches evidence + controls server-side, delegates all interaction to client island.
 */
export default async function EvidencePage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;

    // Translations and tenant context are independent — fetch in parallel
    const [t, tc, ctx] = await Promise.all([
        getTranslations('evidence'),
        getTranslations('common'),
        getTenantCtx({ tenantSlug }),
    ]);

    // Data fetches depend on ctx but are independent of each other.
    // EP-4 — the KPI strips + "all current" celebration are SERVER-computed
    // (getEvidenceRetentionMetrics) rather than counted from the ≤100 SSR
    // rows, so the tiles stay correct past the SSR row cap. The client feeds
    // this as SWR fallbackData and revalidates against /evidence/retention
    // (the same usecase) — the two can never diverge.
    const [evidence, controls, metrics] = await Promise.all([
        listEvidence(ctx, undefined, { take: SSR_PAGE_LIMIT }),
        listControls(ctx, undefined, { take: SSR_PAGE_LIMIT }),
        getEvidenceRetentionMetrics(ctx),
    ]);

    return (
        <EvidenceClient
            initialEvidence={JSON.parse(JSON.stringify(evidence))}
            initialControls={JSON.parse(JSON.stringify(controls))}
            initialMetrics={JSON.parse(JSON.stringify(metrics))}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
            translations={{
                title: t('title'),
                listDescription: t('listDescription'),
                evidenceItems: t('evidenceItems', { count: 0 }),
                evidenceTitle: t('evidenceTitle'),
                type: t('type'),
                control: t('control'),
                status: t('status'),
                ownerLabel: t('ownerLabel'),
                noEvidence: t('noEvidence'),
                submitForReview: t('submitForReview'),
                approveEvidence: t('approveEvidence'),
                rejectEvidence: t('rejectEvidence'),
                addEvidence: t('addEvidence'),
                createEvidence: t('createEvidence'),
                content: t('content'),
                contentPlaceholder: t('contentPlaceholder'),
                draft: t('draft'),
                submitted: t('submitted'),
                approved: t('approved'),
                rejected: t('rejected'),
                none: tc('none'),
                cancel: tc('cancel'),
                actions: tc('actions'),
            }}
        />
    );
}
