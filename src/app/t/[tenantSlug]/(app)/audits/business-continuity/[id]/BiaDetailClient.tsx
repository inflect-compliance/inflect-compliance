'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { MetaStrip, type MetaItem } from '@/components/ui/meta-strip';
import { cardVariants } from '@/components/ui/card';
import { Heading } from '@/components/ui/typography';
import { KPIStat } from '@/components/ui/metric';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';

interface ImpactPoint {
    atHours: number;
    financial?: number;
    operational?: number;
    reputational?: number;
    legal?: number;
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
    dependencies: { id: string; dependsOnType: string; dependsOnId: string }[];
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
    const metaItems: MetaItem[] = [
        { kind: 'status', label: 'Criticality', value: bia.criticality, variant: CRITICALITY_VARIANT[bia.criticality] ?? 'neutral' },
    ];
    if (bia.recovery) metaItems.push({ kind: 'status', label: 'Recovery', value: `#${bia.recovery.rank}`, variant: 'info' });
    if (bia.ownerUser) metaItems.push({ kind: 'text', label: 'Owner', value: bia.ownerUser.name ?? bia.ownerUser.email });

    return (
        <EntityDetailLayout
            back={{ smart: true }}
            breadcrumbs={[
                { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                { label: 'Internal Audit', href: `/t/${tenantSlug}/audits` },
                { label: 'Business Continuity', href: `/t/${tenantSlug}/audits/business-continuity` },
                { label: bia.name },
            ]}
            title={bia.name}
            meta={<MetaStrip items={metaItems} />}
        >
            <div className="space-y-section">
                <Section title="Recovery objectives">
                    <div className="grid grid-cols-1 gap-default sm:grid-cols-3">
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat id="bia-rto" value={hrs(bia.rtoHours)} label="RTO — recovery time" />
                        </div>
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat value={hrs(bia.rpoHours)} label="RPO — data-loss window" />
                        </div>
                        <div className="p-3 rounded-lg bg-bg-default/50">
                            <KPIStat value={hrs(bia.mtpdHours)} label="MTPD — max tolerable disruption" tone="attention" />
                        </div>
                    </div>
                </Section>

                {bia.recovery && (
                    <Section title="Recovery priority">
                        <p className="text-sm text-content-default">
                            <span className="font-semibold">Recovers #{bia.recovery.rank}</span> in the tenant sequence.
                        </p>
                        <p className="text-sm text-content-muted">{bia.recovery.rationale}</p>
                    </Section>
                )}

                {bia.impactProfile && bia.impactProfile.length > 0 && (
                    <Section title="Impact over time">
                        {/* A compact CSS grid (Epic 52 bans raw table elements in app
                            pages); impact ramps by financial/operational/reputational/legal. */}
                        <div className="grid grid-cols-5 gap-x-4 gap-y-1 text-sm">
                            <div className="font-medium text-content-subtle">At</div>
                            <div className="font-medium text-content-subtle">Financial</div>
                            <div className="font-medium text-content-subtle">Operational</div>
                            <div className="font-medium text-content-subtle">Reputational</div>
                            <div className="font-medium text-content-subtle">Legal</div>
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

                <Section title="Dependencies">
                    {bia.dependencies.length === 0 ? (
                        <p className="text-sm text-content-subtle">No dependencies recorded.</p>
                    ) : (
                        <ul className="space-y-tight">
                            {bia.dependencies.map((d) => (
                                <li key={d.id} className="text-sm text-content-default">
                                    <span className="text-content-subtle">{d.dependsOnType}</span> · {d.dependsOnId}
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section title="Linked process & controls">
                    {bia.processNode ? (
                        <p className="text-sm text-content-default">
                            Process node:{' '}
                            <Link
                                href={`/t/${tenantSlug}/processes/${bia.processNode.processMapId}`}
                                className="text-content-link hover:underline"
                            >
                                {bia.processNode.label}
                            </Link>
                        </p>
                    ) : (
                        <p className="text-sm text-content-subtle">Not attached to a modeled process node.</p>
                    )}
                    <p className="text-sm text-content-muted">
                        {bia.evidenceLinks.length} continuity control{bia.evidenceLinks.length === 1 ? '' : 's'} link this BIA as
                        evidence.
                    </p>
                </Section>

                <Section title="Framework">
                    <StatusBadge variant="success">Satisfies NIS2 Art.21(2)(c)</StatusBadge>
                    <p className="text-sm text-content-muted">
                        Business continuity and crisis management — this analysis is the operational artifact for the requirement.
                    </p>
                </Section>

                {bia.notes && (
                    <Section title="Notes">
                        <p className="whitespace-pre-wrap text-sm text-content-default">{bia.notes}</p>
                    </Section>
                )}
            </div>
        </EntityDetailLayout>
    );
}
