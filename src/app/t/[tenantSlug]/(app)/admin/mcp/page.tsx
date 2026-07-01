import { SquareCheck, Workflow } from '@/components/ui/icons/nucleo';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * MCP admin hub — the discovery surface for the agent (Model Context Protocol)
 * human-in-the-loop tools. Both destinations already existed as standalone
 * pages but had no nav affordance; this admin page wires them in one place:
 *   - Agent proposals — the propose-not-commit approval queue (an external
 *     agent's MCP `propose_*` writes land here as PENDING for a human to
 *     approve or reject).
 *   - Agent runs — orchestrator observability: start / watch / resume / abort
 *     the tenant's agentic workflow runs.
 * Admin-gated by the parent /admin layout.
 */
export default async function McpAdminPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const cards = [
        {
            href: tenantHref('/agent-proposals'),
            id: 'mcp-agent-proposals-card',
            icon: SquareCheck,
            title: 'Agent Proposals',
            description:
                'Review the propose-not-commit queue. Approve or reject the writes external agents submit via the MCP propose tools — nothing is created until a human approves.',
        },
        {
            href: tenantHref('/agent-runs'),
            id: 'mcp-agent-runs-card',
            icon: Workflow,
            title: 'Agent Runs',
            description:
                'Observe the orchestrator. Start a workflow, watch its step timeline and cost, resume a paused run after acting on its proposals, or abort a runaway run.',
        },
    ];

    return (
        <div className="space-y-section animate-fadeIn">
            <PageHeader
                back={{ smart: true }}
                breadcrumbs={[
                    { label: 'Dashboard', href: tenantHref('/dashboard') },
                    { label: 'Admin', href: tenantHref('/admin') },
                    { label: 'MCP' },
                ]}
                title="MCP"
                description="Agent (Model Context Protocol) human-in-the-loop tools — the approval queue and the orchestrator."
            />

            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link
                            key={card.id}
                            id={card.id}
                            href={card.href}
                            className="group flex flex-col gap-tight rounded-lg border border-border-subtle bg-bg-default p-4 transition-colors hover:border-border-emphasis"
                        >
                            <span className="flex items-center gap-compact">
                                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-subtle text-content-muted group-hover:text-content-emphasis">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="font-medium text-content-emphasis">{card.title}</span>
                            </span>
                            <span className="text-sm text-content-muted">{card.description}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
