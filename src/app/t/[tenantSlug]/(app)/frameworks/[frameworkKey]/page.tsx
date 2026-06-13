'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RequirePermission } from '@/components/require-permission';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { ProgressBar } from '@/components/ui/progress-bar';

type Tab = 'requirements' | 'packs' | 'coverage';

export default function FrameworkDetailPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const frameworkKey = params.frameworkKey as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);
    const tenantHref = useCallback((path: string) => `/t/${tenantSlug}${path}`, [tenantSlug]);

    const [activeTab, setActiveTab] = useState<Tab>('requirements');
    const [framework, setFramework] = useState<any>(null);
    const [requirements, setRequirements] = useState<any[]>([]);
    const [packs, setPacks] = useState<any[]>([]);
    const [coverage, setCoverage] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedReq, setExpandedReq] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [fwRes, reqRes, packRes, covRes] = await Promise.all([
                    fetch(apiUrl(`/frameworks/${frameworkKey}`)),
                    fetch(apiUrl(`/frameworks/${frameworkKey}?action=requirements`)),
                    fetch(apiUrl(`/frameworks/${frameworkKey}?action=packs`)),
                    fetch(apiUrl(`/frameworks/${frameworkKey}?action=coverage`)),
                ]);
                if (fwRes.ok) setFramework(await fwRes.json());
                if (reqRes.ok) setRequirements(await reqRes.json());
                if (packRes.ok) setPacks(await packRes.json());
                if (covRes.ok) setCoverage(await covRes.json());
            } catch { /* ignore */ }
            setLoading(false);
        })();
    }, [apiUrl, frameworkKey]);

    if (loading) return <div className="p-8 animate-pulse text-content-muted">Loading framework...</div>;
    if (!framework) return <div className="p-8 text-red-400">Framework not found</div>;

    // Group requirements by section
    const groupedReqs = requirements.reduce((acc: Record<string, any[]>, r: any) => {
        const section = r.section || r.category || 'Other';
        (acc[section] = acc[section] || []).push(r);
        return acc;
    }, {});

    // Coverage lookup
    const mappedReqCodes = new Set((coverage?.controlMappings || []).map((m: any) => m.requirementCode));
    const controlsByReq: Record<string, any[]> = {};
    for (const m of (coverage?.controlMappings || [])) {
        (controlsByReq[m.requirementCode] = controlsByReq[m.requirementCode] || []).push(m);
    }

    // Filter
    const filteredGroups = Object.entries(groupedReqs).reduce((acc: Record<string, any[]>, [section, reqs]) => {
        const filtered = (reqs as any[]).filter((r: any) =>
            !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.title.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length > 0) acc[section] = filtered;
        return acc;
    }, {});

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'requirements', label: 'Requirements', count: requirements.length },
        { key: 'packs', label: 'Packs', count: packs.length },
        { key: 'coverage', label: 'Coverage' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <BackAffordance />
                    <h1 className="text-2xl font-bold text-content-emphasis mt-1" id="framework-detail-heading">{framework.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        {framework.version && <span className="badge badge-primary text-xs">v{framework.version}</span>}
                        {framework.kind && <span className="text-xs text-content-subtle">{framework.kind.replace('_', ' ')}</span>}
                    </div>
                    {framework.description && <p className="text-sm text-content-muted mt-2">{framework.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href={tenantHref(`/frameworks/${frameworkKey}/templates`)} className="btn btn-secondary" id="browse-templates-cta">
                        Browse Templates
                    </Link>
                    <RequirePermission resource="frameworks" action="install">
                        <Link href={tenantHref(`/frameworks/${frameworkKey}/install`)} className="btn btn-primary" id="install-pack-cta">
                            Install Pack
                        </Link>
                    </RequirePermission>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-bg-default/50 p-1 rounded-lg w-full sm:w-fit overflow-x-auto" id="framework-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-brand-600 text-content-emphasis' : 'text-content-muted hover:text-content-emphasis'
                            }`}
                        id={`tab-${tab.key}`}
                    >
                        {tab.label}
                        {tab.count !== undefined && <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>}
                    </button>
                ))}
            </div>

            {/* Requirements Tab */}
            {activeTab === 'requirements' && (
                <div className="space-y-4" id="requirements-panel">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            placeholder="Search requirements..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="input w-full sm:w-72"
                            id="requirements-search"
                        />
                        <span className="text-xs text-content-subtle">
                            {Object.values(filteredGroups).flat().length} showing
                        </span>
                    </div>

                    {Object.entries(filteredGroups).map(([section, reqs]) => (
                        <div key={section} className="glass-card">
                            <h3 className="text-sm font-semibold text-[var(--brand-muted)] mb-3">{section}</h3>
                            <div className="space-y-1">
                                {(reqs as any[]).map((r: any) => {
                                    const isMapped = mappedReqCodes.has(r.code);
                                    const controls = controlsByReq[r.code] || [];
                                    const isExpanded = expandedReq === r.id;

                                    return (
                                        <div key={r.id}>
                                            <button
                                                onClick={() => setExpandedReq(isExpanded ? null : r.id)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-elevated/30 transition-colors text-left"
                                            >
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isMapped ? 'bg-emerald-500' : 'bg-border-emphasis'}`} />
                                                <code className="text-xs text-content-subtle font-mono w-16 sm:w-28 flex-shrink-0 truncate">{r.code}</code>
                                                <span className="text-sm text-content-default flex-1">{r.title}</span>
                                                {isMapped ? (
                                                    <span className="badge badge-success text-xs">Mapped ({controls.length})</span>
                                                ) : (
                                                    <span className="badge text-xs" style={{ background: 'rgba(100,116,139,0.3)', color: '#94a3b8' }}>Unmapped</span>
                                                )}
                                            </button>
                                            {isExpanded && controls.length > 0 && (
                                                <div className="ml-4 sm:ml-12 mt-1 mb-2 p-3 rounded-lg bg-bg-default/50 border border-border-default/30">
                                                    <p className="text-xs text-content-subtle mb-2">Mapped Controls:</p>
                                                    {controls.map((ctrl: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 text-sm py-1">
                                                            <code className="text-xs text-[var(--brand-default)] font-mono">{ctrl.controlCode}</code>
                                                            <span className="text-content-default">{ctrl.controlName}</span>
                                                            <span className={`badge text-xs ${ctrl.controlStatus === 'IMPLEMENTED' ? 'badge-success' : ctrl.controlStatus === 'IN_PROGRESS' ? 'badge-warning' : 'badge-primary'}`}>
                                                                {ctrl.controlStatus}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Packs Tab */}
            {activeTab === 'packs' && (
                <div className="space-y-4" id="packs-panel">
                    {packs.map((p: any) => (
                        <div key={p.id} className="glass-card">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-content-emphasis">{p.name}</h3>
                                    {p.description && <p className="text-sm text-content-muted mt-1">{p.description}</p>}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-content-subtle">
                                        <span>{p._count?.templateLinks || 0} templates</span>
                                        {p.version && <span>v{p.version}</span>}
                                    </div>
                                </div>
                                <RequirePermission resource="frameworks" action="install">
                                    <Link
                                        href={tenantHref(`/frameworks/${frameworkKey}/install?pack=${p.key}`)}
                                        className="btn btn-primary"
                                        id={`install-pack-${p.key}`}
                                    >
                                        Install Pack
                                    </Link>
                                </RequirePermission>
                            </div>
                        </div>
                    ))}
                    {packs.length === 0 && (
                        <div className="glass-card text-center py-8 text-content-subtle">No packs available for this framework.</div>
                    )}
                </div>
            )}

            {/* Coverage Tab */}
            {activeTab === 'coverage' && coverage && (
                <div className="space-y-4" id="coverage-panel">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="glass-card text-center">
                            <div className="text-3xl font-bold text-content-emphasis">{coverage.total}</div>
                            <div className="text-xs text-content-muted mt-1">Total Requirements</div>
                        </div>
                        <div className="glass-card text-center">
                            <div className="text-3xl font-bold text-emerald-400">{coverage.mapped}</div>
                            <div className="text-xs text-content-muted mt-1">Mapped</div>
                        </div>
                        <div className="glass-card text-center">
                            <div className={`text-3xl font-bold ${coverage.unmapped > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{coverage.unmapped}</div>
                            <div className="text-xs text-content-muted mt-1">Unmapped</div>
                        </div>
                    </div>

                    {/* Coverage donut */}
                    <div className="glass-card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-content-emphasis">Overall Coverage</h3>
                            <span className={`text-2xl font-bold ${coverage.coveragePercent === 100 ? 'text-emerald-400' : 'text-[var(--brand-default)]'}`}>
                                {coverage.coveragePercent}%
                            </span>
                        </div>
                        <ProgressBar
                            value={coverage.coveragePercent}
                            size="lg"
                            variant={coverage.coveragePercent === 100 ? 'success' : 'brand'}
                            aria-label="Framework coverage"
                        />
                    </div>

                    {/* Section breakdown */}
                    {coverage.bySection?.length > 0 && (
                        <div className="glass-card">
                            <h3 className="text-sm font-semibold text-content-emphasis mb-3">Coverage by Section</h3>
                            <div className="space-y-3">
                                {coverage.bySection.map((s: any) => (
                                    <div key={s.section}>
                                        <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-content-default">{s.section}</span>
                                            <span className="text-content-muted">{s.mapped}/{s.total} ({s.coveragePercent}%)</span>
                                        </div>
                                        <ProgressBar
                                            value={s.coveragePercent}
                                            size="sm"
                                            variant={
                                                s.coveragePercent === 100
                                                    ? 'success'
                                                    : s.coveragePercent > 0
                                                        ? 'brand'
                                                        : 'neutral'
                                            }
                                            aria-label={`${s.section} coverage`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unmapped requirements */}
                    {coverage.unmappedRequirements?.length > 0 && (
                        <div className="glass-card">
                            <h3 className="text-sm font-semibold text-amber-400 mb-3">
                                Unmapped Requirements ({coverage.unmappedRequirements.length})
                            </h3>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {coverage.unmappedRequirements.map((r: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-bg-elevated/20 text-sm">
                                        <span className="w-2 h-2 rounded-full bg-border-emphasis flex-shrink-0" />
                                        <code className="text-xs text-content-subtle font-mono w-16 sm:w-28 flex-shrink-0 truncate">{r.code}</code>
                                        <span className="text-content-muted">{r.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Link href={tenantHref(`/frameworks/${frameworkKey}/coverage`)} className="btn btn-secondary">
                            Full Coverage Report →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
