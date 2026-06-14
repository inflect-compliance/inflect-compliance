'use client';

/**
 * Item 32 — asset quick-look side panel.
 *
 * A single click on an asset row opens this right-side Sheet (the same
 * inspect-without-losing-context pattern the evidence + control list
 * pages use) instead of navigating straight to the full detail page.
 * A "Full view" button in the footer's bottom-right enters the full
 * `/assets/[id]` page when the user wants the tabs + edit surface.
 *
 * The row object is passed in directly (the list already carries every
 * field shown here), so the panel renders instantly with no fetch.
 */
import Link from 'next/link';
import { Sheet } from '@/components/ui/sheet';
import { buttonVariants } from '@/components/ui/button-variants';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { AssetCriticalityBadge } from './_form/AssetCriticalityFields';

interface AssetRow {
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

export function AssetDetailSheet({
    asset,
    open,
    onOpenChange,
    tenantHref,
}: {
    asset: AssetRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantHref: (path: string) => string;
}) {
    const statusVariant: StatusBadgeVariant =
        asset?.status === 'RETIRED' ? 'neutral' : 'success';

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            size="md"
            title={asset?.name ?? 'Asset'}
        >
            <Sheet.Header
                title={asset?.name ?? 'Asset'}
                description={
                    asset
                        ? [asset.key, asset.type?.replace(/_/g, ' ')]
                              .filter(Boolean)
                              .join(' · ')
                        : undefined
                }
            />
            {asset && (
                <Sheet.Body>
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
                </Sheet.Body>
            )}
            <Sheet.Footer className="flex justify-end">
                {asset && (
                    <Link
                        href={tenantHref(`/assets/${asset.id}`)}
                        id="asset-sheet-full-view"
                        className={buttonVariants({ variant: 'primary', size: 'sm' })}
                    >
                        Full view →
                    </Link>
                )}
            </Sheet.Footer>
        </Sheet>
    );
}
