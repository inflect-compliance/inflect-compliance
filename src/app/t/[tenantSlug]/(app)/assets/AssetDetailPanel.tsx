'use client';

/**
 * Asset quick-look rail content.
 *
 * A single click on an asset name opens this in an `<AsidePanel>` — the
 * same docked right-rail the Controls + Tasks lists use (co-resident with
 * the table, not a blocking overlay). This component owns only the panel
 * CONTENT; `AssetsClient` owns the `<AsidePanel>` chrome. A "Full view"
 * button enters the full `/assets/[id]` page (tabs + edit surface).
 *
 * The row object is passed in directly (the list already carries every
 * field shown here), so the panel renders instantly with no fetch.
 */
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { AssetCriticalityBadge } from './_form/AssetCriticalityFields';

export interface AssetPanelRow {
    id: string;
    key?: string | null;
    name: string;
    type?: string | null;
    status?: string | null;
    owner?: string | null;
    classification?: string | null;
    confidentiality?: number | null;
    integrity?: number | null;
    availability?: number | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-default border-b border-border-subtle py-2.5 last:border-0">
            <span className="text-xs uppercase tracking-wider text-content-subtle">{label}</span>
            <span className="text-sm text-content-default text-right">{children}</span>
        </div>
    );
}

export function AssetDetailPanel({
    asset,
    tenantHref,
}: {
    asset: AssetPanelRow;
    tenantHref: (path: string) => string;
}) {
    const statusVariant: StatusBadgeVariant =
        asset.status === 'RETIRED' ? 'neutral' : 'success';
    const subtitle = [asset.key, asset.type?.replace(/_/g, ' ')]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="flex h-full flex-col">
            {subtitle && (
                <p className="mb-1 text-xs text-content-subtle">{subtitle}</p>
            )}
            <div className="flex justify-center py-2">
                <AssetCriticalityBadge
                    confidentiality={asset.confidentiality ?? 3}
                    integrity={asset.integrity ?? 3}
                    availability={asset.availability ?? 3}
                />
            </div>
            <div className="mt-2">
                <Row label="Status">
                    <StatusBadge variant={statusVariant} size="sm">
                        {asset.status || 'ACTIVE'}
                    </StatusBadge>
                </Row>
                <Row label="Type">
                    {asset.type ? asset.type.replace(/_/g, ' ') : '—'}
                </Row>
                <Row label="Owner">{asset.owner || '—'}</Row>
                <Row label="Classification">{asset.classification || '—'}</Row>
                <Row label="Confidentiality">{asset.confidentiality ?? '—'}</Row>
                <Row label="Integrity">{asset.integrity ?? '—'}</Row>
                <Row label="Availability">{asset.availability ?? '—'}</Row>
            </div>
            <div className="mt-auto flex justify-end pt-4">
                <Link
                    href={tenantHref(`/assets/${asset.id}`)}
                    id="asset-panel-full-view"
                    className={buttonVariants({ variant: 'primary', size: 'sm' })}
                >
                    Full view →
                </Link>
            </div>
        </div>
    );
}
