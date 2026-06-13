'use client';
import { formatDateTime } from '@/lib/format-date';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { RequirePermission } from '@/components/require-permission';
import { UpgradeGate } from '@/components/UpgradeGate';
import { CopyButton } from '@/components/ui/copy-button';

const ENTITY_ICON: Record<string, AppIconName> = {
    CONTROL: 'controls', POLICY: 'policies', EVIDENCE: 'evidence', FILE: 'overview', ISSUE: 'warning',
    READINESS_REPORT: 'dashboard', FRAMEWORK_COVERAGE: 'frameworks',
};

export default function PackDetailPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const packId = params.packId as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const [pack, setPack] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [freezing, setFreezing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [cloning, setCloning] = useState(false);
    const router = useRouter();

    const loadPack = useCallback(() => {
        fetch(apiUrl(`/audits/packs/${packId}`))
            .then(r => r.ok ? r.json() : null)
            .then(setPack)
            .finally(() => setLoading(false));
    }, [apiUrl, packId]);

    useEffect(() => { loadPack(); }, [loadPack]);

    const freeze = async () => {
        setFreezing(true);
        try {
            const res = await fetch(apiUrl(`/audits/packs/${packId}?action=freeze`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (res.ok) loadPack();
            else {
                const err = await res.json();
                alert(err.message || 'Failed to freeze');
            }
        } finally { setFreezing(false); }
    };

    const share = async () => {
        setSharing(true);
        try {
            const res = await fetch(apiUrl(`/audits/packs/${packId}?action=share`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (res.ok) {
                const data = await res.json();
                const link = `${window.location.origin}/audit/shared/${data.token}`;
                setShareLink(link);
            }
        } finally { setSharing(false); }
    };

    if (loading) return <div className="p-8"><div className="glass-card animate-pulse h-64" /></div>;
    if (!pack) return <div className="p-8 text-center text-content-muted">Pack not found</div>;

    const isDraft = pack.status === 'DRAFT';
    const isFrozen = pack.status === 'FROZEN' || pack.status === 'EXPORTED';

    // Group items by entity type
    const grouped: Record<string, any[]> = {};
    (pack.items || []).forEach((item: any) => {
        if (!grouped[item.entityType]) grouped[item.entityType] = [];
        grouped[item.entityType].push(item);
    });

    return (
        <div className="space-y-6 animate-fadeIn">
            <BackAffordance />

            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-bold" id="pack-name">{pack.name}</h1>
                        <p className="text-sm text-content-muted">
                            {pack.cycle?.frameworkKey} · {pack._count?.items || 0} items ·
                            <span className={`badge ml-2 ${isDraft ? 'badge-neutral' : 'badge-info'}`} id="pack-status">{pack.status}</span>
                        </p>
                        {pack.frozenAt && (
                            <p className="text-xs text-content-subtle mt-1">
                                Frozen {formatDateTime(pack.frozenAt)} by {pack.frozenBy?.name || pack.frozenBy?.email || 'Admin'}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isDraft && (
                            <RequirePermission resource="audits" action="freeze">
                                <button onClick={freeze} disabled={freezing} className="btn btn-primary inline-flex items-center gap-2" id="freeze-pack-btn">
                                    <AppIcon name="lock" size={16} />
                                    {freezing ? 'Freezing...' : 'Freeze Pack'}
                                </button>
                            </RequirePermission>
                        )}
                        {isFrozen && (
                            <RequirePermission resource="audits" action="share">
                                <UpgradeGate feature="AUDIT_PACK_SHARING">
                                    <button onClick={share} disabled={sharing} className="btn btn-primary inline-flex items-center gap-2" id="share-pack-btn">
                                        <AppIcon name="share" size={16} />
                                        {sharing ? 'Creating...' : 'Generate Share Link'}
                                    </button>
                                </UpgradeGate>
                            </RequirePermission>
                        )}
                        {isFrozen && (
                            <RequirePermission resource="audits" action="manage">
                                <button onClick={async () => {
                                    setCloning(true);
                                    try {
                                        const res = await fetch(apiUrl(`/audits/packs/${packId}?action=clone`), {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
                                        });
                                        if (res.ok) {
                                            const cloned = await res.json();
                                            router.push(`/t/${tenantSlug}/audits/packs/${cloned.id}`);
                                        }
                                    } finally { setCloning(false); }
                                }} disabled={cloning} className="btn btn-secondary" id="clone-pack-btn">
                                    <AppIcon name="refresh" size={16} className="inline-block mr-1" />
                                    {cloning ? 'Cloning...' : 'Clone for Retest'}
                                </button>
                            </RequirePermission>
                        )}
                    </div>
                </div>
            </div>

            {/* Share Link */}
            {shareLink && (
                <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/5 animate-fadeIn" id="share-link-card">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-emerald-400">Share Link Generated</p>
                            <p className="text-xs text-content-muted mt-1 break-all" id="share-link-url">{shareLink}</p>
                        </div>
                        <CopyButton
                            value={shareLink}
                            label="Copy share link"
                            successMessage="Share link copied"
                            size="md"
                        />
                    </div>
                </div>
            )}

            {/* Items grouped by type */}
            {Object.keys(grouped).length === 0 ? (
                <div className="glass-card p-12 text-center text-content-muted">
                    <p>No items in this pack yet.</p>
                </div>
            ) : (
                Object.entries(grouped).map(([type, items]) => (
                    <div key={type} className="space-y-2">
                        <h3 className="text-sm font-semibold text-content-default flex items-center gap-2">
                            <AppIcon name={ENTITY_ICON[type] || 'overview'} size={16} />
                            <span>{type}</span>
                            <span className="text-content-subtle">({items.length})</span>
                        </h3>
                        <div className="glass-card divide-y divide-border-default/50">
                            {items.slice(0, 50).map((item: any) => {
                                let snap: any = {};
                                try { snap = JSON.parse(item.snapshotJson || '{}'); } catch { /* */ }
                                const name = snap.code || snap.title || snap.name || item.entityId;
                                const status = snap.status || '';
                                return (
                                    <div key={item.id} className="p-3 flex items-center justify-between text-sm">
                                        <div className="flex-1 min-w-0">
                                            <span className="font-medium truncate block">{name}</span>
                                            {snap.description && <span className="text-xs text-content-subtle truncate block">{snap.description}</span>}
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            {status && <span className="badge badge-neutral text-xs">{status}</span>}
                                            {snap.taskCompletion && (
                                                <span className="text-xs text-content-subtle">
                                                    Tasks: {snap.taskCompletion.done}/{snap.taskCompletion.total}
                                                </span>
                                            )}
                                            {snap.evidenceCount !== undefined && (
                                                <span className="text-xs text-content-subtle">
                                                    Evidence: {snap.evidenceCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* Export area (placeholder) */}
            {isFrozen && (
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><AppIcon name="export" size={16} /> Exports</h3>
                    <div className="flex gap-2">
                        <a href={apiUrl(`/audits/packs/${packId}?action=export&format=json`)}
                            target="_blank" rel="noopener" className="btn btn-secondary btn-sm inline-flex items-center gap-1"><AppIcon name="download" size={14} /> Export JSON</a>
                        <a href={apiUrl(`/audits/packs/${packId}?action=export&format=csv`)}
                            target="_blank" rel="noopener" className="btn btn-secondary btn-sm inline-flex items-center gap-1"><AppIcon name="download" size={14} /> Export CSV</a>
                    </div>
                </div>
            )}
        </div>
    );
}
