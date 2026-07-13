'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { MetaStrip, type MetaItem } from '@/components/ui/meta-strip';
import { cardVariants } from '@/components/ui/card';
import { Heading } from '@/components/ui/typography';
import { KPIStat } from '@/components/ui/metric';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastWithUndo } from '@/components/ui/hooks';
import { DependencyPickerRow, useDepTypeLabel } from '../BiaDependencyControls';
import { BiaLinkControlModal } from './BiaLinkControlModal';

interface ImpactPoint {
    atHours: number;
    financial?: number;
    operational?: number;
    reputational?: number;
    legal?: number;
}

interface ResolvedDependency {
    id: string;
    dependsOnType: string;
    dependsOnId: string;
    targetName: string | null;
    targetPath: string | null;
}

interface LinkedControl {
    id: string;
    name: string;
    code: string | null;
    requirements: { code: string; title: string; frameworkKey: string; frameworkName: string }[];
}

export interface BiaDetail {
    id: string;
    name: string;
    criticality: string;
    rtoHours: number | null;
    rpoHours: number | null;
    mtpdHours: number | null;
    impactProfile: ImpactPoint[] | null;
    notes: string | null;
    reviewedAt: string | null;
    processNode: { id: string; label: string; processMapId: string } | null;
    ownerUser: { id: string; name: string | null; email: string } | null;
    dependencies: ResolvedDependency[];
    linkedControls: LinkedControl[];
    evidenceLinks: { id: string; controlId: string }[];
    recovery: { rank: number; rationale: string } | null;
}

const CRITICALITY_VARIANT: Record<string, StatusBadgeVariant> = {
    CRITICAL: 'error',
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'info',
};

const hrs = (v: number | null) => (v != null ? `${v}h` : '—');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className={cn(cardVariants({ density: 'none' }), 'space-y-default')}>
            <Heading level={2}>{title}</Heading>
            {children}
        </div>
    );
}

export function BiaDetailClient({ bia, tenantSlug }: { bia: BiaDetail; tenantSlug: string }) {
    const tx = useTranslations('audits');
    const router = useRouter();
    const depTypeLabel = useDepTypeLabel();
    const triggerUndoToast = useToastWithUndo();
    const [showLinkControl, setShowLinkControl] = useState(false);
    const [depError, setDepError] = useState<string | null>(null);

    const addDependency = async (draft: { dependsOnType: string; dependsOnId: string }) => {
        setDepError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/business-continuity/${bia.id}/dependencies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            if (!res.ok) throw new Error(tx('biaDetail.addDependencyFailed'));
            router.refresh();
        } catch (e) {
            setDepError(e instanceof Error ? e.message : tx('biaDetail.addDependencyFailed'));
        }
    };

    const removeDependency = (dep: ResolvedDependency) => {
        triggerUndoToast({
            message: tx('biaDetail.dependencyRemoved'),
            undoMessage: tx('biaDetail.undo'),
            action: async () => {
                const res = await fetch(
                    `/api/t/${tenantSlug}/business-continuity/${bia.id}/dependencies/${dep.id}`,
                    { method: 'DELETE' },
                );
                if (!res.ok) throw new Error('remove');
                router.refresh();
            },
            onError: () => router.refresh(),
        });
    };

    const metaItems: MetaItem[] = [
        { kind: 'status', label: tx('biaDetail.metaCriticality'), value: bia.criticality, variant: CRITICALITY_VARIANT[bia.criticality] ?? 'neutral' },
    ];
    if (bia.recovery) metaItems.push({ kind: 'status', label: tx('biaDetail.metaRecovery'), value: `#${bia.recovery.rank}`, variant: 'info' });
    if (bia.ownerUser) metaItems.push({ kind: 'text', label: tx('biaDetail.metaOwner'), value: bia.ownerUser.name ?? bia.ownerUser.email });

    return (
        <EntityDetailLayout
            back={{ smart: true }}
            breadcrumbs={[
                { label: tx('crumb.dashboard'), href: `/t/${tenantSlug}/dashboard` },
                { label: tx('crumb.internalAudit'), href: `/t/${tenantSlug}/audits` },
                { label: tx('crumb.businessContinuity'), href: `/t/${tenantSlug}/audits/business-continuity` },
                { label: bia.name },
            ]}
            title={bia.name}
            meta={<MetaStrip items={metaItems} />}
        >
            <div className="space-y-section">
                <Section title={tx('biaDetail.secRecoveryObjectives')}>
                    <div className="grid grid-cols-1 gap-default sm:grid-cols-3">
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat id="bia-rto" value={hrs(bia.rtoHours)} label={tx('biaDetail.kpiRto')} />
                        </div>
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat value={hrs(bia.rpoHours)} label={tx('biaDetail.kpiRpo')} />
                        </div>
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat value={hrs(bia.mtpdHours)} label={tx('biaDetail.kpiMtpd')} tone="attention" />
                        </div>
                    </div>
                </Section>

                {bia.recovery && (
                    <Section title={tx('biaDetail.secRecoveryPriority')}>
                        <p className="text-sm text-content-default">
                            {tx.rich('biaDetail.recoversSeq', { rank: bia.recovery.rank, b: (c) => <span className="font-semibold">{c}</span> })}
                        </p>
                        <p className="text-sm text-content-muted">{bia.recovery.rationale}</p>
                    </Section>
                )}

                {bia.impactProfile && bia.impactProfile.length > 0 && (
                    <Section title={tx('biaDetail.secImpact')}>
                        {/* A compact CSS grid (Epic 52 bans raw table elements in app
                            pages); impact ramps by financial/operational/reputational/legal. */}
                        <div className="grid grid-cols-5 gap-x-4 gap-y-1 text-sm">
                            <div className="font-medium text-content-subtle">{tx('biaDetail.impactAt')}</div>
                            <div className="font-medium text-content-subtle">{tx('biaDetail.impactFinancial')}</div>
                            <div className="font-medium text-content-subtle">{tx('biaDetail.impactOperational')}</div>
                            <div className="font-medium text-content-subtle">{tx('biaDetail.impactReputational')}</div>
                            <div className="font-medium text-content-subtle">{tx('biaDetail.impactLegal')}</div>
                            {bia.impactProfile.map((p, i) => (
                                <div key={i} className="contents">
                                    <div className="tabular-nums border-t border-border-subtle pt-1">{p.atHours}h</div>
                                    <div className="tabular-nums text-content-muted border-t border-border-subtle pt-1">{p.financial ?? '—'}</div>
                                    <div className="tabular-nums text-content-muted border-t border-border-subtle pt-1">{p.operational ?? '—'}</div>
                                    <div className="tabular-nums text-content-muted border-t border-border-subtle pt-1">{p.reputational ?? '—'}</div>
                                    <div className="tabular-nums text-content-muted border-t border-border-subtle pt-1">{p.legal ?? '—'}</div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                <Section title={tx('biaDetail.secDependencies')}>
                    {bia.dependencies.length === 0 ? (
                        <p className="text-sm text-content-subtle">{tx('biaDetail.dependenciesEmpty')}</p>
                    ) : (
                        <ul className="space-y-tight">
                            {bia.dependencies.map((d) => (
                                <li
                                    key={d.id}
                                    className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
                                >
                                    <span className="text-content-default">
                                        <span className="text-content-subtle">{depTypeLabel(d.dependsOnType)}</span>{' '}
                                        ·{' '}
                                        {d.targetPath ? (
                                            <Link href={`/t/${tenantSlug}${d.targetPath}`} className="text-content-link hover:underline">
                                                {d.targetName}
                                            </Link>
                                        ) : (
                                            <span className="text-content-muted">{d.targetName ?? tx('biaDetail.depMissing')}</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeDependency(d)}
                                        className="text-content-muted hover:text-content-error"
                                        aria-label={tx('biaDetail.depRemove')}
                                    >
                                        {tx('biaDetail.depRemove')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="space-y-tight">
                        <DependencyPickerRow
                            tenantSlug={tenantSlug}
                            excludeIds={bia.dependencies.map((d) => d.dependsOnId)}
                            onAdd={addDependency}
                        />
                        {depError && <p className="text-sm text-content-error">{depError}</p>}
                    </div>
                </Section>

                <Section title={tx('biaDetail.secLinked')}>
                    {bia.processNode ? (
                        <p className="text-sm text-content-default">
                            {tx('biaDetail.processNodePrefix')}{' '}
                            <Link
                                href={`/t/${tenantSlug}/processes/${bia.processNode.processMapId}`}
                                className="text-content-link hover:underline"
                            >
                                {bia.processNode.label}
                            </Link>
                        </p>
                    ) : (
                        <p className="text-sm text-content-subtle">{tx('biaDetail.notAttached')}</p>
                    )}
                </Section>

                <Section title={tx('biaDetail.secFramework')}>
                    <p className="text-sm text-content-muted">{tx('biaDetail.secFrameworkDesc')}</p>
                    {bia.linkedControls.length === 0 ? (
                        <EmptyState
                            size="sm"
                            variant="missing-prereqs"
                            title={tx('biaDetail.noControlsTitle')}
                            description={tx('biaDetail.linkControlPrompt')}
                            primaryAction={{ label: tx('biaDetail.linkControlAction'), onClick: () => setShowLinkControl(true) }}
                        />
                    ) : (
                        <div className="space-y-default">
                            {bia.linkedControls.map((c) => (
                                <div key={c.id} className="rounded-lg border border-border-subtle p-3 space-y-tight">
                                    <Link
                                        href={`/t/${tenantSlug}/controls/${c.id}`}
                                        className="text-sm font-medium text-content-link hover:underline"
                                    >
                                        {c.code ? `${c.code} · ${c.name}` : c.name}
                                    </Link>
                                    {c.requirements.length === 0 ? (
                                        <p className="text-sm text-content-subtle">{tx('biaDetail.controlNoMappings')}</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-tight">
                                            {c.requirements.map((r, i) => (
                                                <StatusBadge key={`${r.frameworkKey}:${r.code}:${i}`} variant="info">
                                                    {r.frameworkName} · {r.code}
                                                </StatusBadge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <Button variant="secondary" onClick={() => setShowLinkControl(true)}>
                                {tx('biaDetail.linkControlAction')}
                            </Button>
                        </div>
                    )}
                </Section>

                {bia.notes && (
                    <Section title={tx('biaDetail.secNotes')}>
                        <p className="whitespace-pre-wrap text-sm text-content-default">{bia.notes}</p>
                    </Section>
                )}
            </div>

            {showLinkControl && (
                <BiaLinkControlModal
                    tenantSlug={tenantSlug}
                    biaId={bia.id}
                    linkedControlIds={bia.linkedControls.map((c) => c.id)}
                    onClose={() => setShowLinkControl(false)}
                    onLinked={() => {
                        setShowLinkControl(false);
                        router.refresh();
                    }}
                />
            )}
        </EntityDetailLayout>
    );
}
