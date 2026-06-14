'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Heading } from '@/components/ui/typography';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { KPIStat } from '@/components/ui/metric';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DiffPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const tenantSlug = params.tenantSlug as string;
    const frameworkKey = params.frameworkKey as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const fromKey = searchParams.get('from') || '';
    const [diff, setDiff] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'added' | 'removed' | 'changed'>('added');

    useEffect(() => {
        (async () => {
            try {
                if (fromKey) {
                    const diffRes = await fetch(apiUrl(`/frameworks/${frameworkKey}?action=diff&from=${fromKey}`));
                    if (diffRes.ok) {
                        setDiff(await diffRes.json());
                    } else {
                        setError('Failed to compute diff. Ensure both frameworks exist.');
                    }
                }
            } catch { setError('Failed to load data'); }
            setLoading(false);
        })();
    }, [apiUrl, frameworkKey, fromKey]);

    if (loading) return <div className="p-8 animate-pulse text-content-muted">Loading diff…</div>;

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <div>
                <Heading level={1} className="mt-2" id="diff-heading">
                    Requirements Diff
                </Heading>
                {diff && (
                    <p className="text-sm text-content-muted mt-1">
                        Comparing <span className="text-[var(--brand-default)]">{diff.from.name} v{diff.from.version}</span>
                        {' → '}
                        <span className="text-[var(--brand-default)]">{diff.to.name} v{diff.to.version}</span>
                    </p>
                )}
            </div>

            {!fromKey && (
                <div className={cn(cardVariants({ density: 'none' }), 'text-center py-8 text-content-muted')}>
                    <p>Specify a <code className="text-[var(--brand-default)]">?from=FRAMEWORK_KEY</code> query parameter to compare.</p>
                    <p className="text-xs mt-2 text-content-subtle">This page compares the &quot;from&quot; framework to this framework to show added/removed/changed requirements.</p>
                </div>
            )}

            {error && <div className={cn(cardVariants({ density: 'none' }), 'text-content-error')}>{error}</div>}

            {diff && (
                <>
                    {/* Summary cards — Polish PR-2: KPIStat primitive. */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-default" id="diff-summary">
                        <div className={cardVariants({ density: 'none' })}>
                            <KPIStat value={diff.summary.added} label="Added" tone="success" />
                        </div>
                        <div className={cardVariants({ density: 'none' })}>
                            <KPIStat value={diff.summary.removed} label="Removed" tone="critical" />
                        </div>
                        <div className={cardVariants({ density: 'none' })}>
                            <KPIStat value={diff.summary.changed} label="Changed" tone="attention" />
                        </div>
                        <div className={cardVariants({ density: 'none' })}>
                            <KPIStat
                                value={diff.summary.unmappedNewRequirements}
                                label="New Unmapped"
                                tone={diff.summary.unmappedNewRequirements > 0 ? 'critical' : 'success'}
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-bg-default/50 p-1 rounded-lg w-fit" id="diff-tabs">
                        {(['added', 'removed', 'changed'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? 'bg-brand-600 text-content-emphasis' : 'text-content-muted hover:text-content-emphasis'
                                    }`}
                                id={`diff-tab-${tab}`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({diff[tab].length})
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="space-y-tight" id="diff-content">
                        {activeTab === 'added' && diff.added.map((r: any, i: number) => (
                            <div key={i} className={cn(cardVariants({ density: 'none' }), 'flex items-center gap-compact')}>
                                <span className="text-content-success text-lg font-bold">+</span>
                                <code className="text-xs text-[var(--brand-default)] font-mono w-28 flex-shrink-0">{r.code}</code>
                                <span className="text-sm text-content-default">{r.title}</span>
                                {r.section && <span className="text-xs text-content-subtle ml-auto">{r.section}</span>}
                            </div>
                        ))}

                        {activeTab === 'removed' && diff.removed.map((r: any, i: number) => (
                            <div key={i} className={cn(cardVariants({ density: 'none' }), 'flex items-center gap-compact')}>
                                <span className="text-content-error text-lg font-bold">−</span>
                                <code className="text-xs text-content-muted font-mono w-28 flex-shrink-0 line-through">{r.code}</code>
                                <span className="text-sm text-content-subtle line-through">{r.title}</span>
                                {r.section && <span className="text-xs text-content-subtle ml-auto">{r.section}</span>}
                            </div>
                        ))}

                        {activeTab === 'changed' && diff.changed.map((r: any, i: number) => (
                            <div key={i} className={cardVariants({ density: 'none' })}>
                                <div className="flex items-center gap-compact mb-2">
                                    <span className="text-content-warning text-lg font-bold">~</span>
                                    <code className="text-xs text-[var(--brand-default)] font-mono">{r.code}</code>
                                    <span className="text-xs text-content-subtle">Changed: {r.changes.join(', ')}</span>
                                </div>
                                <div className="ml-8 space-y-1">
                                    {r.changes.includes('title') && (
                                        <div className="text-xs">
                                            <span className="text-content-error line-through">{r.from.title}</span>
                                            <span className="text-content-subtle mx-2">→</span>
                                            <span className="text-content-success">{r.to.title}</span>
                                        </div>
                                    )}
                                    {r.changes.includes('section') && (
                                        <div className="text-xs">
                                            <span className="text-content-subtle">Section: </span>
                                            <span className="text-content-error">{r.from.section || '(none)'}</span>
                                            <span className="text-content-subtle mx-2">→</span>
                                            <span className="text-content-success">{r.to.section || '(none)'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {diff[activeTab].length === 0 && (
                            <div className={cn(cardVariants({ density: 'none' }), 'text-center py-6 text-content-subtle')}>
                                No {activeTab} requirements.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
