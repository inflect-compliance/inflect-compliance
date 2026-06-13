'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatDate } from '@/lib/format-date';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { BackAffordance } from '@/components/nav/BackAffordance';

const FW_META: Record<string, { icon: AppIconName; label: string }> = {
    ISO27001: { icon: 'shield', label: 'ISO/IEC 27001:2022' },
    NIS2: { icon: 'globe', label: 'NIS2 Directive' },
};

export default function AuditorPortalPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const [packs, setPacks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPack, setSelectedPack] = useState<any>(null);

    useEffect(() => {
        fetch(apiUrl('/audits/auditor/packs'))
            .then(r => r.ok ? r.json() : [])
            .then(setPacks)
            .finally(() => setLoading(false));
    }, [apiUrl]);

    const loadPack = async (packId: string) => {
        const res = await fetch(apiUrl(`/audits/packs/${packId}`));
        if (res.ok) setSelectedPack(await res.json());
    };

    if (loading) return (
        <div className="p-8">
            <div className="glass-card animate-pulse h-48" />
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            <BackAffordance />
            <div>
                <h1 className="text-2xl font-bold" id="auditor-heading">Auditor Portal</h1>
                <p className="text-content-muted text-sm">Review assigned audit packs</p>
            </div>

            {packs.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="mb-4"><AppIcon name="lock" size={48} className="text-content-muted" /></div>
                    <h3 className="text-lg font-semibold mb-2">No assigned packs</h3>
                    <p className="text-content-muted text-sm">You have not been assigned any audit packs yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        {packs.map(p => {
                            const meta = FW_META[p.cycle?.frameworkKey] || { icon: 'shield' as AppIconName, label: p.cycle?.frameworkKey || '' };
                            return (
                                <button key={p.id} onClick={() => loadPack(p.id)}
                                    className={`w-full text-left glass-card p-4 hover:bg-bg-elevated/30 transition ${selectedPack?.id === p.id ? 'ring-2 ring-[var(--ring)]' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <AppIcon name={meta.icon} size={20} />
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{p.name}</p>
                                            <p className="text-xs text-content-subtle">{meta.label} · {p.status}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-content-subtle mt-1">{p.items?.length || 0} items</p>
                                </button>
                            );
                        })}
                    </div>
                    <div className="lg:col-span-2">
                        {selectedPack ? (
                            <div className="glass-card p-6 space-y-4 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold" id="auditor-pack-name">{selectedPack.name}</h2>
                                        <p className="text-sm text-content-muted">
                                            {selectedPack.status} · {selectedPack._count?.items || 0} items
                                            {selectedPack.frozenAt && ` · Frozen: ${formatDate(selectedPack.frozenAt)}`}
                                        </p>
                                    </div>
                                    <span className={`badge ${selectedPack.status === 'FROZEN' ? 'badge-info' : 'badge-neutral'}`}>
                                        {selectedPack.status}
                                    </span>
                                </div>

                                {/* Items grouped */}
                                {selectedPack.items?.length > 0 && (() => {
                                    const grouped: Record<string, any[]> = {};
                                    selectedPack.items.forEach((item: any) => {
                                        if (!grouped[item.entityType]) grouped[item.entityType] = [];
                                        grouped[item.entityType].push(item);
                                    });
                                    return Object.entries(grouped).map(([type, items]) => (
                                        <div key={type}>
                                            <h3 className="text-sm font-semibold text-content-default mb-1">{type} ({items.length})</h3>
                                            <div className="border border-border-default/50 rounded-lg divide-y divide-border-default/50">
                                                {items.map((item: any) => {
                                                    let snap: any = {};
                                                    try { snap = JSON.parse(item.snapshotJson || '{}'); } catch { /* */ }
                                                    return (
                                                        <div key={item.id} className="p-2 text-sm">
                                                            <span className="font-medium">{snap.code || snap.title || snap.name || item.entityId}</span>
                                                            {snap.description && <span className="text-xs text-content-subtle ml-2">{snap.description}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        ) : (
                            <div className="glass-card p-12 text-center text-content-subtle">
                                Select a pack to review
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
