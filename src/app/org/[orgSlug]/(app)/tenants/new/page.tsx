import { notFound } from 'next/navigation';

import { getTranslations } from 'next-intl/server';

import { getOrgCtx } from '@/app-layer/context';
import { forbidden } from '@/lib/errors/types';
import { NewTenantForm } from './NewTenantForm';

/**
 * Epic O-4 — Create a new tenant under the org.
 *
 * Server component: resolves the OrgContext, gates on
 * `canManageTenants`, and renders the client form. The form POSTs to
 * `/api/org/{slug}/tenants` (Epic O-2), which auto-provisions every
 * other ORG_ADMIN as AUDITOR in the new tenant — that's what makes
 * the portfolio drill-down work for the rest of the team.
 *
 * Anti-enumeration: a non-member or an org member without
 * `canManageTenants` collapses to the standard 404 surface, same as
 * the rest of the org tree.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

export default async function NewTenantPage({ params }: PageProps) {
    const { orgSlug } = await params;

    let ctx;
    try {
        ctx = await getOrgCtx({ orgSlug });
    } catch {
        notFound();
    }

    if (!ctx.permissions.canManageTenants) {
        // Same anti-enumeration posture as the layout: a non-admin
        // sees a 404 rather than a "not allowed" message that
        // confirms the org exists and they're a member.
        const t = await getTranslations('org');
        throw forbidden(t('errors.noPermissionTenants'));
    }

    return <NewTenantForm orgSlug={orgSlug} />;
}
