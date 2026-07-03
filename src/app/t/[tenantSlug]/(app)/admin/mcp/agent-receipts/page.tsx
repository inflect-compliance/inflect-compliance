import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/status-badge';
import { BadgeCheck, TriangleWarning } from '@/components/ui/icons/nucleo';
import { getTenantCtx } from '@/app-layer/context';
import { listReceipts } from '@/app-layer/usecases/agent-action-receipt';
import { formatDateTime } from '@/lib/format-date';

export const dynamic = 'force-dynamic';

/**
 * Agent-action receipts — the MCP activity evidence view.
 *
 * Each row is a mediator-signed (pipelock) receipt of an AI/MCP agent tool
 * decision. The green "Signature verified" badge means the Ed25519 signature was
 * verified in-app against the configured pipelock public key and the receipt is
 * linked to a hash-chained AuditLog entry; the amber badge means the signature
 * was invalid or absent — the receipt is retained + flagged, never trusted.
 * Admin-gated by the parent /admin layout.
 */
export default async function AgentReceiptsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const ctx = await getTenantCtx({ tenantSlug });
    const receipts = await listReceipts(ctx, { limit: 100 });

    return (
        <div className="space-y-section animate-fadeIn">
            <PageHeader
                back={{ smart: true }}
                breadcrumbs={[
                    { label: 'Dashboard', href: tenantHref('/dashboard') },
                    { label: 'Admin', href: tenantHref('/admin') },
                    { label: 'MCP', href: tenantHref('/admin/mcp') },
                    { label: 'Agent Receipts' },
                ]}
                title="Agent Receipts"
                description="Externally-verifiable, mediator-signed evidence of agent tool actions (pipelock). Verified receipts link to the hash-chained audit trail."
            />

            {receipts.length === 0 ? (
                <p className="text-sm text-content-muted">
                    No agent-action receipts yet. Once the pipelock mediator is in front of the MCP surface, each
                    mediated tool decision posts a signed receipt here.
                </p>
            ) : (
                <ul className="space-y-default">
                    {receipts.map((r) => (
                        <li
                            key={r.id}
                            className="flex flex-col gap-tight rounded-lg border border-border-subtle bg-bg-default p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="flex flex-col gap-tight">
                                <span className="flex items-center gap-compact">
                                    <span className="font-medium text-content-emphasis">{r.toolName}</span>
                                    <StatusBadge variant="neutral" tone="subtle">
                                        {r.decisionVerdict}
                                    </StatusBadge>
                                </span>
                                <span className="text-sm text-content-muted">
                                    {r.activePolicy ? `Policy: ${r.activePolicy} · ` : ''}
                                    {r.agentId ? `Agent: ${r.agentId} · ` : ''}
                                    {formatDateTime(r.occurredAt)}
                                </span>
                            </div>
                            <div className="flex items-center gap-compact">
                                {r.verified ? (
                                    <StatusBadge
                                        variant="success"
                                        icon={BadgeCheck}
                                        tooltip="Ed25519 signature verified; linked to the hash-chained audit trail."
                                    >
                                        Signature verified
                                    </StatusBadge>
                                ) : (
                                    <StatusBadge
                                        variant="warning"
                                        icon={TriangleWarning}
                                        tooltip="Signature invalid or absent — retained + flagged, not linked to the audit trail."
                                    >
                                        Unverified
                                    </StatusBadge>
                                )}
                                <a
                                    href={`/api/t/${tenantSlug}/agent-receipts/${r.id}/export`}
                                    className="text-sm text-content-info hover:underline"
                                >
                                    Export
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
