'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format-date';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';

export interface ProposalRow {
    id: string;
    kind: string;
    status: string;
    payloadJson: string;
    rationale: string | null;
    proposedViaKeyId: string | null;
    createdAt: string;
}

/**
 * The review-queue client. Renders each PENDING agent proposal with its
 * proposed content (full, untruncated — AISVS C9.2.2) + the agent's rationale,
 * and Approve / Reject actions. Approve runs the real create-usecase server-
 * side; the agent never commits.
 */
export function AgentProposalsClient({
    initialProposals,
}: {
    tenantSlug: string;
    initialProposals: ProposalRow[];
}) {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const [proposals, setProposals] = useState(initialProposals);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function act(id: string, action: 'approve' | 'reject') {
        setBusy(id);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/agent-proposals/${id}/${action}`), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error?.message ?? `Failed to ${action}`);
            }
            setProposals((prev) => prev.filter((p) => p.id !== id));
        } catch (e) {
            setError(e instanceof Error ? e.message : `Failed to ${action}`);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-section animate-fadeIn">
            <PageHeader
                back={{ smart: true }}
                breadcrumbs={[
                    { label: 'Dashboard', href: tenantHref('/dashboard') },
                    { label: 'Admin', href: tenantHref('/admin') },
                    { label: 'MCP', href: tenantHref('/admin/mcp') },
                    { label: 'Agent proposals' },
                ]}
                title="Agent proposals"
                description="Pending proposals from an external agent (MCP). Approve to create the real record; reject to discard. An agent never creates a record directly."
            />

            {error && (
                <div className={cn(cardVariants({ density: 'compact' }), 'text-sm text-content-danger')}>
                    {error}
                </div>
            )}

            {proposals.length === 0 ? (
                <EmptyState
                    title="No pending proposals"
                    description="When an agent proposes a risk, control, policy, or finding via the MCP server, it appears here for your review."
                />
            ) : (
                <ul className="space-y-default">
                    {proposals.map((p) => {
                        let payload: unknown;
                        try {
                            payload = JSON.parse(p.payloadJson);
                        } catch {
                            payload = p.payloadJson;
                        }
                        return (
                            <li
                                key={p.id}
                                id={`proposal-${p.id}`}
                                className={cn(cardVariants({ density: 'comfortable' }), 'space-y-default')}
                            >
                                <div className="flex items-center justify-between gap-default">
                                    <div className="flex items-center gap-tight">
                                        <StatusBadge variant="info">{p.kind}</StatusBadge>
                                        <span className="text-xs text-content-subtle">
                                            proposed {formatDateTime(p.createdAt)}
                                            {p.proposedViaKeyId ? ` · key ${p.proposedViaKeyId.slice(0, 8)}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-tight">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy === p.id}
                                            onClick={() => act(p.id, 'reject')}
                                        >
                                            Reject
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={busy === p.id}
                                            onClick={() => act(p.id, 'approve')}
                                        >
                                            Approve
                                        </Button>
                                    </div>
                                </div>

                                {p.rationale && (
                                    <p className="text-sm text-content-muted">
                                        <span className="font-medium text-content-default">Rationale: </span>
                                        {p.rationale}
                                    </p>
                                )}

                                <pre className="overflow-x-auto rounded border border-border-subtle bg-bg-subtle p-3 text-xs text-content-default">
                                    {JSON.stringify(payload, null, 2)}
                                </pre>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
