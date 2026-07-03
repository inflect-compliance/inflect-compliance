import { getTenantCtx } from '@/app-layer/context';
import { listAiSystems } from '@/app-layer/usecases/ai-system';
import { AiSystemsClient, type AiSystemRow } from './AiSystemsClient';

export const dynamic = 'force-dynamic';

/**
 * EU AI Act AI-System Registry — Server Component. A subpage of Risks. Lists
 * each registered AI system with its risk tier and obligation count; delegates
 * classify + create to the client island.
 */
export default async function AiSystemsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listAiSystems(ctx)) as unknown as AiSystemRow[];

    return (
        <AiSystemsClient
            initialRows={JSON.parse(JSON.stringify(rows))}
            tenantSlug={resolved.tenantSlug}
            canWrite={ctx.permissions.canWrite}
        />
    );
}
