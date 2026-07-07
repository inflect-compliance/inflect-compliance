'use client';
import { formatDateTime } from '@/lib/format-date';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { Card, cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const ENTITY_ICON: Record<string, AppIconName> = {
    CONTROL: 'controls', POLICY: 'policies', EVIDENCE: 'evidence', FILE: 'overview', ISSUE: 'warning',
    READINESS_REPORT: 'dashboard', FRAMEWORK_COVERAGE: 'frameworks',
};

// getPackByShareToken (audit-readiness/sharing.ts) — public share payload.
interface SharedPackData {
    pack: {
        id: string;
        name: string;
        status: 'DRAFT' | 'FROZEN' | 'EXPORTED';
        frozenAt: string | null;
    };
    cycle: { name: string; frameworkKey: string; frameworkVersion: string };
    items: Array<{
        id: string;
        entityType: 'CONTROL' | 'POLICY' | 'EVIDENCE' | 'FILE' | 'ISSUE' | 'READINESS_REPORT' | 'FRAMEWORK_COVERAGE';
        entityId: string;
        snapshotJson: string;
    }>;
}

type PackItem = SharedPackData['items'][number];
// Parsed `snapshotJson` blob — heterogeneous per entity type, all optional.
interface PackSnapshot {
    code?: string;
    title?: string;
    name?: string;
    status?: string;
    description?: string;
    taskCompletion?: { done: number; total: number };
    evidenceCount?: number;
    mappedRequirements?: { code: string }[];
    severity?: string;
}

export default function SharedPackPage() {
    const t = useTranslations('external.auditShare');
    const params = useParams();
    const token = params.token as string;

    const [data, setData] = useState<SharedPackData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/audit/shared/${token}`)
            .then(async r => {
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.message || t('invalidOrExpired'));
                }
                return r.json();
            })
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
        // `t` is a stable next-intl accessor; excluding it avoids a refetch loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    if (loading) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="w-96"><SkeletonCard lines={2} /></div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <Card className="max-w-md text-center">
                <div className="mb-4"><AppIcon name="lock" size={48} className="text-slate-400" /></div>
                <Heading level={1} className="mb-2">{t('accessDenied')}</Heading>
                <p className="text-slate-400 text-sm">{error}</p>
            </Card>
        </div>
    );

    const pack = data?.pack;
    const cycle = data?.cycle;
    const items = data?.items || [];

    const grouped: Record<string, PackItem[]> = {};
    items.forEach((item) => {
        if (!grouped[item.entityType]) grouped[item.entityType] = [];
        grouped[item.entityType].push(item);
    });

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            <div className="max-w-4xl mx-auto p-6 space-y-section">
                {/* Header */}
                <div className="text-center py-4">
                    <div className="text-sm text-slate-500 uppercase tracking-wide mb-2">{t('sharedAuditPack')}</div>
                    <Heading level={1} id="shared-pack-name">{pack?.name}</Heading>
                    <p className="text-slate-400 text-sm mt-1">
                        {cycle?.name} · {cycle?.frameworkKey} · {pack?.status}
                    </p>
                    {pack?.frozenAt && (
                        <p className="text-xs text-slate-500 mt-1">
                            {t('frozen', { date: formatDateTime(pack.frozenAt) })}
                        </p>
                    )}
                </div>

                {/* Summary */}
                <div className={cardVariants({ density: 'compact' })} id="shared-pack-summary">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-default text-center">
                        {Object.entries(grouped).map(([type, typeItems]) => (
                            <div key={type} className="p-3">
                                <div><AppIcon name={ENTITY_ICON[type] || 'overview'} size={20} /></div>
                                <div className="text-lg font-bold">{typeItems.length}</div>
                                <div className="text-xs text-slate-400">{t(`entityType.${type}`)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Items */}
                {Object.entries(grouped).map(([type, typeItems]) => (
                    <div key={type} className="space-y-tight">
                        <Heading level={3} className="text-slate-300 flex items-center gap-tight">
                            <AppIcon name={ENTITY_ICON[type] || 'overview'} size={16} />
                            <span>{t(`entityType.${type}`)}</span>
                            <span className="text-slate-500">({typeItems.length})</span>
                        </Heading>
                        <div className={cn(cardVariants({ density: 'none' }), 'divide-y divide-slate-700/50')}>
                            {typeItems.map((item) => {
                                let snap: PackSnapshot = {};
                                try { snap = JSON.parse(item.snapshotJson || '{}'); } catch { /* */ }
                                const name = snap.code || snap.title || snap.name || item.entityId;
                                return (
                                    <div key={item.id} className="p-3 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{name}</span>
                                            {snap.status && <StatusBadge variant="neutral">{snap.status}</StatusBadge>}
                                        </div>
                                        {snap.description && <p className="text-xs text-slate-500 mt-1">{snap.description}</p>}
                                        <div className="flex gap-default mt-1 text-xs text-slate-500">
                                            {snap.taskCompletion && <span>{t('tasksLabel', { done: snap.taskCompletion.done, total: snap.taskCompletion.total })}</span>}
                                            {snap.evidenceCount !== undefined && <span>{t('evidenceLabel', { count: snap.evidenceCount })}</span>}
                                            {snap.mappedRequirements && snap.mappedRequirements.length > 0 && (
                                                <span>{t('requirementsLabel', { codes: snap.mappedRequirements.map((r) => r.code).join(', ') })}</span>
                                            )}
                                            {snap.severity && <span>{t('severityLabel', { severity: snap.severity })}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div className="text-center py-8 text-xs text-slate-600">
                    {t('footer')}
                </div>
            </div>
        </div>
    );
}
