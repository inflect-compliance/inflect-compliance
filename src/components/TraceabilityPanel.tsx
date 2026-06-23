'use client';
import { useState, useEffect } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import useSWR, { useSWRConfig } from 'swr';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToastWithUndo } from '@/components/ui/hooks';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface TraceabilityPanelProps {
    apiBase: string;            // e.g. /api/t/acme-corp
    entityType: 'control' | 'risk' | 'asset';
    entityId: string;
    canWrite: boolean;
    tenantHref: (path: string) => string;
    tenantSlug?: string;        // for cache key scoping
}

const RISK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: 'error', MITIGATING: 'warning', CLOSED: 'success', ACCEPTED: 'info',
};

// Shape returned by `/{controls,risks,assets}/{id}/traceability` and held
// in the react-query cache. The three sections share one entry shape; the
// linked entity carries the superset of fields the three entity types
// surface (risk: title/status/score · control: code/name/status · asset:
// name/type/criticality), all optional so the optimistic temp-entry write
// (which fills a generic "Loading…" placeholder) type-checks. All three
// sections being `TraceLinkEntry[]` is what keeps the dynamic-key write
// `updated[section] = …` assignable.
interface TraceLinkedEntity {
    id: string;
    title?: string;
    name?: string;
    code?: string;
    status?: string;
    score?: number;
    type?: string;
    criticality?: string;
}
interface TraceLinkEntry {
    id: string;
    rationale: string | null;
    risk?: TraceLinkedEntity;
    control?: TraceLinkedEntity;
    asset?: TraceLinkedEntity;
}
type TraceSection = 'risks' | 'controls' | 'assets';
interface TraceabilityData {
    risks: TraceLinkEntry[];
    controls: TraceLinkEntry[];
    assets: TraceLinkEntry[];
}

// Dropdown option shapes for the link pickers (cap'd list endpoints).
interface RiskOption { id: string; title: string; status?: string; }
interface ControlOption { id: string; code?: string | null; name: string; status?: string; }
interface AssetOption { id: string; name: string; type?: string; }

export default function TraceabilityPanel({ apiBase: apiBaseRaw, entityType, entityId, canWrite, tenantHref, tenantSlug: tenantSlugProp }: TraceabilityPanelProps) {
    // Callers pass `apiUrl('')` which yields `/api/t/<slug>/` with a
    // trailing slash. Concatenating `${apiBase}/risks/…` then produces a
    // `//` path which Next.js middleware redirects (308) to the canonical
    // URL — the redirected request drops fetch credentials, and the
    // server-side log shows no traceability call. Strip the trailing
    // slash once so every nested URL is well-formed.
    const apiBase = apiBaseRaw.replace(/\/+$/, '');
    // Extract tenantSlug from apiBase if not provided (e.g. /api/t/acme-corp → acme-corp)
    const tenantSlug = tenantSlugProp || apiBase.split('/t/')[1]?.split('/')[0] || '';
    const { mutate: swrMutate } = useSWRConfig();
    const triggerUndoToast = useToastWithUndo();

    // Add forms
    const [showAddRisk, setShowAddRisk] = useState(false);
    const [showAddControl, setShowAddControl] = useState(false);
    const [showAddAsset, setShowAddAsset] = useState(false);
    const [addId, setAddId] = useState('');
    const [addRationale, setAddRationale] = useState('');

    // Available items for dropdown

    const [availableRisks, setAvailableRisks] = useState<RiskOption[]>([]);

    const [availableControls, setAvailableControls] = useState<ControlOption[]>([]);

    const [availableAssets, setAvailableAssets] = useState<AssetOption[]>([]);

    const traceUrlFor = (type: 'control' | 'risk' | 'asset', id: string) =>
        type === 'control'
            ? `${apiBase}/controls/${id}/traceability`
            : type === 'risk'
                ? `${apiBase}/risks/${id}/traceability`
                : `${apiBase}/assets/${id}/traceability`;
    const traceUrl = traceUrlFor(entityType, entityId);

    // Revalidate the parent list's SWR cache (every ?qs variant) after a
    // link/unlink so RAG counts on the index pages stay correct. Only
    // controls + risks have list pages that read traceability-derived counts.
    const revalidateList = (type: 'risk' | 'control' | 'asset') => {
        if (type !== 'control' && type !== 'risk') return;
        const prefix = `${apiBase}/${type === 'control' ? 'controls' : 'risks'}`;
        swrMutate(
            (k) => typeof k === 'string' && (k === prefix || k.startsWith(`${prefix}?`)),
            undefined,
            { revalidate: true },
        );
    };

    // ─── Query: traceability data ───
    const traceQuery = useSWR<TraceabilityData | null>(
        entityId && tenantSlug ? traceUrl : null,
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) return null;
            return res.json();
        },
    );

    const data = traceQuery.data;
    const loading = traceQuery.isLoading;

    // Fetch available items when forms open.
    //
    // B1 — `/risks`, `/assets`, `/controls` all return the cap'd
    // `{ rows, truncated }` shape from `applyBackfillCap`. Pre-B1
    // the panel only knew about (a) bare array and (b) the
    // entity-keyed shape `{ risks: [...] }` / etc. — neither
    // matched, so every linking dropdown silently rendered empty.
    // The `unwrap` helper accepts every shape the API has ever
    // returned for these endpoints; new shapes need an explicit
    // entry.
    //
    const unwrap = <T,>(d: unknown, entityKey: 'risks' | 'controls' | 'assets'): T[] => {
        if (Array.isArray(d)) return d as T[];
        const o = d as Record<string, unknown> | null;
        if (o && Array.isArray(o.rows)) return o.rows as T[];
        if (o && Array.isArray(o[entityKey])) return o[entityKey] as T[];
        if (o && Array.isArray(o.items)) return o.items as T[];
        return [];
    };
    useEffect(() => {
        if (showAddRisk) fetch(`${apiBase}/risks`).then(r => r.ok ? r.json() : []).then(d => setAvailableRisks(unwrap(d, 'risks')));
    }, [showAddRisk, apiBase]);
    useEffect(() => {
        if (showAddControl) fetch(`${apiBase}/controls`).then(r => r.ok ? r.json() : []).then(d => setAvailableControls(unwrap(d, 'controls')));
    }, [showAddControl, apiBase]);
    useEffect(() => {
        if (showAddAsset) fetch(`${apiBase}/assets`).then(r => r.ok ? r.json() : []).then(d => setAvailableAssets(unwrap(d, 'assets')));
    }, [showAddAsset, apiBase]);

    // ─── Link (optimistic) ───
    const [linking, setLinking] = useState(false);

    // POST url + body for a given (entityType, linkType) pair.
    const buildLinkRequest = (
        type: 'risk' | 'control' | 'asset',
        linkedId: string,
        rationale?: string,
    ): { url: string; body: Record<string, string | undefined> } => {
        if (entityType === 'control' && type === 'risk')
            return { url: `${apiBase}/controls/${entityId}/risks`, body: { riskId: linkedId, rationale: rationale || undefined } };
        if (entityType === 'control' && type === 'asset')
            return { url: `${apiBase}/assets/${linkedId}/controls`, body: { controlId: entityId, rationale: rationale || undefined } };
        if (entityType === 'risk' && type === 'control')
            return { url: `${apiBase}/controls/${linkedId}/risks`, body: { riskId: entityId, rationale: rationale || undefined } };
        if (entityType === 'risk' && type === 'asset')
            return { url: `${apiBase}/assets/${linkedId}/risks`, body: { riskId: entityId, rationale: rationale || undefined } };
        if (entityType === 'asset' && type === 'control')
            return { url: `${apiBase}/assets/${entityId}/controls`, body: { controlId: linkedId, rationale: rationale || undefined } };
        return { url: `${apiBase}/assets/${entityId}/risks`, body: { riskId: linkedId, rationale: rationale || undefined } };
    };

    const handleLink = async (type: 'risk' | 'control' | 'asset') => {
        if (!addId) return;
        const linkedId = addId;
        const rationale = addRationale || undefined;
        const section: TraceSection = type === 'risk' ? 'risks' : type === 'control' ? 'controls' : 'assets';
        setLinking(true);
        try {
            await swrMutate(
                traceUrl,
                async () => {
                    const { url, body } = buildLinkRequest(type, linkedId, rationale);
                    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    if (!res.ok) throw new Error('Link failed');
                    // Return undefined so SWR revalidates to the authoritative row.
                    return undefined;
                },
                {
                    optimisticData: (current: TraceabilityData | null | undefined) => {
                        if (!current) return current ?? null;
                        const tempEntry: TraceLinkEntry = {
                            id: `temp:${crypto.randomUUID()}`,
                            rationale: rationale || null,
                            [type]: { id: linkedId, title: 'Loading...', name: 'Loading...', status: '—', code: '' },
                        };
                        return { ...current, [section]: [...(current[section] || []), tempEntry] };
                    },
                    rollbackOnError: true,
                    populateCache: false,
                    revalidate: true,
                },
            );
            // Success: close only the form that was just linked (mirror the
            // old onSuccess — staged sibling forms stay open).
            setAddId('');
            setAddRationale('');
            if (type === 'risk') setShowAddRisk(false);
            else if (type === 'control') setShowAddControl(false);
            else if (type === 'asset') setShowAddAsset(false);
            // Cross-revalidate the linked entity's mirror view + parent list.
            swrMutate(traceUrlFor(type, linkedId));
            revalidateList(type);
        } catch {
            // rollbackOnError restored the cache; leave the form open.
        } finally {
            setLinking(false);
        }
    };

    // ─── Unlink — Epic 67 delayed-commit via useToastWithUndo ───
    //
    // Optimistic removal applies immediately on click via setQueryData
    // so the row visually disappears. The actual DELETE is deferred 5s
    // by the shared hook; clicking Undo restores the snapshot. If the
    // commit fails the snapshot also restores. Cross-entity invalidation
    // runs on commit success, mirroring the pre-Epic-67 mutation's
    // onSettled fan-out.
    const unlinkUrl = (type: 'risk' | 'control' | 'asset', linkedId: string): string => {
        if (entityType === 'control' && type === 'risk') return `${apiBase}/controls/${entityId}/risks/${linkedId}`;
        if (entityType === 'control' && type === 'asset') return `${apiBase}/assets/${linkedId}/controls/${entityId}`;
        if (entityType === 'risk' && type === 'control') return `${apiBase}/controls/${linkedId}/risks/${entityId}`;
        if (entityType === 'risk' && type === 'asset') return `${apiBase}/assets/${linkedId}/risks/${entityId}`;
        if (entityType === 'asset' && type === 'control') return `${apiBase}/assets/${entityId}/controls/${linkedId}`;
        if (entityType === 'asset' && type === 'risk') return `${apiBase}/assets/${entityId}/risks/${linkedId}`;
        return '';
    };

    const UNLINK_LABEL: Record<'risk' | 'control' | 'asset', string> = {
        risk: 'Risk unlinked',
        control: 'Control unlinked',
        asset: 'Asset unlinked',
    };

    const handleUnlink = (type: 'risk' | 'control' | 'asset', linkedId: string) => {
        // Snapshot the currently-rendered data so undo restores exactly what
        // the user saw — not a stale snapshot from a concurrent mutation.
        const previous = traceQuery.data;
        const section: TraceSection = type === 'risk' ? 'risks' : type === 'control' ? 'controls' : 'assets';

        if (previous) {
            const updated = {
                ...previous,
                [section]: (previous[section] || []).filter((l) => l[type]?.id !== linkedId),
            };
            // Optimistic removal — no revalidate yet (the DELETE is deferred
            // 5s by the undo hook).
            swrMutate(traceUrl, updated, { revalidate: false });
        }

        triggerUndoToast({
            message: UNLINK_LABEL[type],
            undoMessage: 'Undo',
            action: async () => {
                const url = unlinkUrl(type, linkedId);
                const res = await fetch(url, { method: 'DELETE' });
                if (!res.ok) throw new Error('Unlink failed');
                // Revalidate this entity + the linked entity's mirror view +
                // the parent list so RAG counts on the index pages stay
                // correct after a commit.
                swrMutate(traceUrl);
                swrMutate(traceUrlFor(type, linkedId));
                revalidateList(type);
            },
            undoAction: () => {
                if (previous) swrMutate(traceUrl, previous, { revalidate: false });
            },
            onError: () => {
                if (previous) swrMutate(traceUrl, previous, { revalidate: false });
            },
        });
    };

    if (loading) return <div className="p-6 text-center text-content-subtle animate-pulse">Loading traceability…</div>;
    if (!data) return <div className="p-6 text-center text-content-subtle">Failed to load traceability data</div>;

    const risks = data.risks || [];
    const controls = data.controls || [];
    const assets = data.assets || [];

    // Determine which sections to show based on entity type
    const showRisks = entityType === 'control' || entityType === 'asset';
    const showControls = entityType === 'risk' || entityType === 'asset';
    const showAssets = entityType === 'control' || entityType === 'risk';

    return (
        <div className="space-y-section" id="traceability-panel">
            {/* Risks section */}
            {showRisks && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <Heading level={3} className="text-content-emphasis inline-flex items-center gap-tight">{entityType === 'control' ? <><AppIcon name="shield" size={16} /> Mitigates Risks</> : <><AppIcon name="warning" size={16} /> Associated Risks</>} ({risks.length})</Heading>
                        {canWrite && (
                            <Button variant="primary" size="xs" onClick={() => { setShowAddRisk(!showAddRisk); setAddId(''); }} id="add-risk-link-btn">Link Risk</Button>
                        )}
                    </div>
                    {showAddRisk && canWrite && (
                        <div className={cn(cardVariants({ density: 'compact' }), 'mb-3 space-y-tight')}>
                            <Combobox
                                id="risk-select"
                                selected={availableRisks.map((r) => ({ value: r.id, label: r.title, meta: { status: r.status } })).find((o: { value: string }) => o.value === addId) ?? null}
                                setSelected={(opt) => setAddId(opt?.value ?? '')}
                                options={availableRisks.map((r) => ({ value: r.id, label: r.title, meta: { status: r.status } }))}
                                optionDescription={(o) => (o.meta?.status ? `Status: ${o.meta.status}` : null)}
                                placeholder="Select risk..."
                                matchTriggerWidth
                            />
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <Button variant="primary" size="xs" disabled={!addId || linking} onClick={() => handleLink('risk')} id="confirm-risk-link">
                                {linking ? 'Linking...' : 'Link'}
                            </Button>
                        </div>
                    )}
                    <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                        {risks.length === 0 ? (
                            <div className="p-6 text-center text-content-subtle text-sm" id="no-risks">No risks linked</div>
                        ) : (
                            <table className="data-table" id="linked-risks-table">
                                <thead><tr><th>Risk</th><th>Status</th><th>Score</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    { }
                                    {risks.map((l) => {
                                        const r = l.risk;
                                        return (
                                            <tr key={l.id} className={l.id?.startsWith('temp:') ? 'opacity-50 animate-pulse' : ''}>
                                                <td className="text-sm text-content-default">{r?.title || '—'}</td>
                                                <td><StatusBadge variant={RISK_STATUS_BADGE[r?.status ?? ''] || 'neutral'}>{r?.status || '—'}</StatusBadge></td>
                                                <td className="text-sm text-content-emphasis font-medium">{r?.score ?? '—'}</td>
                                                <td className="text-xs text-content-muted">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td>
                                                        <Tooltip content="Unlink risk">
                                                            <button className="text-content-error text-xs hover:text-content-error" onClick={() => handleUnlink('risk', r?.id ?? '')} id={`unlink-risk-${r?.id}`} aria-label="Unlink risk">×</button>
                                                        </Tooltip>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Controls section */}
            {showControls && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <Heading level={3} className="text-content-emphasis inline-flex items-center gap-tight">{entityType === 'risk' ? <><AppIcon name="shield" size={16} /> Mitigated by Controls</> : <><AppIcon name="controls" size={16} /> Covered by Controls</>} ({controls.length})</Heading>
                        {canWrite && (
                            <Button variant="primary" size="xs" onClick={() => { setShowAddControl(!showAddControl); setAddId(''); }} id="add-control-link-btn">Link Control</Button>
                        )}
                    </div>
                    {showAddControl && canWrite && (
                        <div className={cn(cardVariants({ density: 'compact' }), 'mb-3 space-y-tight')}>
                            <Combobox
                                id="control-select"
                                selected={availableControls.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name, meta: { status: c.status } })).find((o: { value: string }) => o.value === addId) ?? null}
                                setSelected={(opt) => setAddId(opt?.value ?? '')}
                                options={availableControls.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name, meta: { status: c.status } }))}
                                optionDescription={(o) => (o.meta?.status ? `Status: ${o.meta.status}` : null)}
                                placeholder="Select control..."
                                matchTriggerWidth
                            />
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <Button variant="primary" size="xs" disabled={!addId || linking} onClick={() => handleLink('control')} id="confirm-control-link">
                                {linking ? 'Linking...' : 'Link'}
                            </Button>
                        </div>
                    )}
                    <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                        {controls.length === 0 ? (
                            <div className="p-6 text-center text-content-subtle text-sm" id="no-controls">No controls linked</div>
                        ) : (
                            <table className="data-table" id="linked-controls-table">
                                <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    { }
                                    {controls.map((l) => {
                                        const c = l.control;
                                        return (
                                            <tr key={l.id} className={l.id?.startsWith('temp:') ? 'opacity-50 animate-pulse' : ''}>
                                                <td className="font-mono text-xs text-[var(--brand-muted)]">{c?.code || '—'}</td>
                                                <td className="text-sm text-content-default">{c?.name || '—'}</td>
                                                <td><StatusBadge variant="info">{c?.status || '—'}</StatusBadge></td>
                                                <td className="text-xs text-content-muted">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td>
                                                        <Tooltip content="Unlink control">
                                                            <button className="text-content-error text-xs hover:text-content-error" onClick={() => handleUnlink('control', c?.id ?? '')} id={`unlink-control-${c?.id}`} aria-label="Unlink control">×</button>
                                                        </Tooltip>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Assets section */}
            {showAssets && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <Heading level={3} className="text-content-emphasis inline-flex items-center gap-tight"><AppIcon name="package" size={16} /> {entityType === 'control' ? 'Covers Assets' : 'Affects Assets'} ({assets.length})</Heading>
                        {canWrite && (
                            <Button variant="primary" size="xs" onClick={() => { setShowAddAsset(!showAddAsset); setAddId(''); }} id="add-asset-link-btn">Link Asset</Button>
                        )}
                    </div>
                    {showAddAsset && canWrite && (
                        <div className={cn(cardVariants({ density: 'compact' }), 'mb-3 space-y-tight')}>
                            <Combobox
                                id="asset-select"
                                selected={availableAssets.map((a) => ({ value: a.id, label: a.name, meta: { type: a.type } })).find((o: { value: string }) => o.value === addId) ?? null}
                                setSelected={(opt) => setAddId(opt?.value ?? '')}
                                options={availableAssets.map((a) => ({ value: a.id, label: a.name, meta: { type: a.type } }))}
                                optionDescription={(o) => (o.meta?.type ? `Type: ${o.meta.type}` : null)}
                                placeholder="Select asset..."
                                matchTriggerWidth
                            />
                            <input type="text" className="input w-full text-sm" placeholder="Rationale (optional)" value={addRationale} onChange={e => setAddRationale(e.target.value)} />
                            <Button variant="primary" size="xs" disabled={!addId || linking} onClick={() => handleLink('asset')} id="confirm-asset-link">
                                {linking ? 'Linking...' : 'Link'}
                            </Button>
                        </div>
                    )}
                    <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                        {assets.length === 0 ? (
                            <div className="p-6 text-center text-content-subtle text-sm" id="no-assets">No assets linked</div>
                        ) : (
                            <table className="data-table" id="linked-assets-table">
                                <thead><tr><th>Name</th><th>Type</th><th>Criticality</th><th>Rationale</th>{canWrite && <th>Actions</th>}</tr></thead>
                                <tbody>
                                    { }
                                    {assets.map((l) => {
                                        const a = l.asset;
                                        return (
                                            <tr key={l.id} className={l.id?.startsWith('temp:') ? 'opacity-50 animate-pulse' : ''}>
                                                <td className="text-sm text-content-default">{a?.name || '—'}</td>
                                                <td className="text-xs"><StatusBadge variant="info">{a?.type || '—'}</StatusBadge></td>
                                                <td className="text-xs">{a?.criticality ? <StatusBadge variant={a.criticality === 'HIGH' ? 'error' : a.criticality === 'MEDIUM' ? 'warning' : 'neutral'}>{a.criticality}</StatusBadge> : '—'}</td>
                                                <td className="text-xs text-content-muted">{l.rationale || '—'}</td>
                                                {canWrite && (
                                                    <td>
                                                        <Tooltip content="Unlink asset">
                                                            <button className="text-content-error text-xs hover:text-content-error" onClick={() => handleUnlink('asset', a?.id ?? '')} id={`unlink-asset-${a?.id}`} aria-label="Unlink asset">×</button>
                                                        </Tooltip>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
