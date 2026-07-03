'use client';

/**
 * AI system detail — shows the EU AI Act classification basis, the linked
 * AI-Act / ISO 42001 obligations, and (for HIGH-risk systems) buttons to
 * generate DRAFT conformity artifacts. Generation is propose-not-commit: it
 * queues a proposal for human review; nothing is auto-published.
 */
import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { TIER_VARIANT } from '../AiSystemsClient';

export interface AiSystemDetail {
    id: string;
    name: string;
    provider: string | null;
    deploymentRole: string;
    riskTier: string;
    status: string;
    purpose: string | null;
    useContext: string | null;
    classificationClauseId: string | null;
    classificationRationale: string | null;
    requirementLinks: Array<{
        id: string;
        requirement: {
            id: string;
            code: string;
            title: string;
            framework: { key: string; name: string };
        };
    }>;
}

interface Props {
    system: AiSystemDetail;
    tenantSlug: string;
    canWrite: boolean;
}

const DOC_TYPES = [
    { id: 'ANNEX_IV_TECHNICAL_DOCUMENTATION', label: 'Technical Documentation (Annex IV)' },
    { id: 'ART_9_RISK_MANAGEMENT', label: 'Risk Management record (Art. 9)' },
    { id: 'ANNEX_V_DECLARATION_OF_CONFORMITY', label: 'Declaration of Conformity (Annex V)' },
] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 border-b border-border-subtle py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-xs uppercase tracking-wide text-content-subtle">{label}</span>
            <span className="text-sm text-content-default sm:text-right">{children}</span>
        </div>
    );
}

export function AiSystemDetailClient({ system, tenantSlug, canWrite }: Props) {
    const [busy, setBusy] = useState<string | null>(null);
    const [queued, setQueued] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const generate = async (docType: string) => {
        setError(null);
        setBusy(docType);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/ai-systems/${system.id}/conformity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docType }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? 'Failed to generate draft');
            }
            setQueued((q) => [...q, docType]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate draft');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-section">
            <PageHeader
                back={{ smart: true }}
                breadcrumbs={[
                    { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                    { label: 'Risks', href: `/t/${tenantSlug}/risks` },
                    { label: 'AI Systems', href: `/t/${tenantSlug}/risks/ai-systems` },
                    { label: system.name },
                ]}
                title={system.name}
                description={`${system.riskTier} risk · ${system.classificationClauseId ?? 'unclassified'} · ${system.deploymentRole === 'PROVIDER' ? 'Provider' : 'Deployer'}`}
                actions={
                    <StatusBadge variant={TIER_VARIANT[system.riskTier] ?? 'neutral'}>
                        {system.riskTier}
                    </StatusBadge>
                }
            />

            <Card>
                <h2 className="mb-2 text-sm font-semibold text-content-emphasis">Classification</h2>
                <Row label="Risk tier">
                    <StatusBadge variant={TIER_VARIANT[system.riskTier] ?? 'neutral'}>{system.riskTier}</StatusBadge>
                </Row>
                <Row label="Driving clause">{system.classificationClauseId ?? '—'}</Row>
                <Row label="Basis">{system.classificationRationale ?? '—'}</Row>
                <Row label="Provider">{system.provider ?? '—'}</Row>
                <Row label="Purpose">{system.purpose ?? '—'}</Row>
                <Row label="Use context">{system.useContext ?? '—'}</Row>
            </Card>

            <Card>
                <h2 className="mb-2 text-sm font-semibold text-content-emphasis">
                    Linked obligations ({system.requirementLinks.length})
                </h2>
                {system.requirementLinks.length === 0 ? (
                    <p className="text-sm text-content-muted">No obligations linked.</p>
                ) : (
                    <ul className="space-y-tight">
                        {system.requirementLinks.map((l) => (
                            <li key={l.id} className="flex items-start gap-tight text-sm">
                                <StatusBadge variant="info" size="sm">
                                    {l.requirement.framework.key} {l.requirement.code}
                                </StatusBadge>
                                <span className="text-content-default">{l.requirement.title}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {system.riskTier === 'HIGH' && (
                <Card>
                    <h2 className="mb-1 text-sm font-semibold text-content-emphasis">Conformity artifacts</h2>
                    <p className="mb-3 text-xs text-content-subtle">
                        Generate a DRAFT for human review. A draft is queued in the approval queue — nothing is
                        published, and a Declaration of Conformity is never auto-issued.
                    </p>
                    {error && (
                        <div className="mb-3 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="flex flex-col gap-tight sm:flex-row sm:flex-wrap">
                        {DOC_TYPES.map((d) => (
                            <Button
                                key={d.id}
                                variant="secondary"
                                size="sm"
                                disabled={!canWrite || busy === d.id || queued.includes(d.id)}
                                onClick={() => generate(d.id)}
                            >
                                {busy === d.id ? 'Generating…' : queued.includes(d.id) ? 'Queued ✓' : d.label}
                            </Button>
                        ))}
                    </div>
                    {queued.length > 0 && (
                        <p className="mt-3 text-sm text-content-muted">
                            Draft{queued.length > 1 ? 's' : ''} queued for review in the{' '}
                            <Link href={`/t/${tenantSlug}/agent-proposals`} className="text-content-link underline">
                                approval queue
                            </Link>
                            .
                        </p>
                    )}
                </Card>
            )}
        </div>
    );
}
