import { RespondClient } from './RespondClient';

/**
 * NIS2 gap-assessment — assignee answer page (Prompt 2). A tenant member opens
 * only THEIR assigned questions (the bucket is authorised server-side in the
 * usecase) and submits. Sub-page of the Audits lifecycle surface.
 */
export default async function RespondPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; assignmentId: string }>;
}) {
    const { tenantSlug, assignmentId } = await params;
    return <RespondClient tenantSlug={tenantSlug} assignmentId={assignmentId} />;
}
