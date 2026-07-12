'use client';

/* RQ-5 — Risk hierarchy: org trees with recursive ALE roll-up + treemap. */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { InfoTooltip } from '@/components/ui/tooltip';
import { InlineNotice } from '@/components/ui/inline-notice';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { useTenantApiUrl, useTenantHref, useMoneyFormatter } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTranslations } from 'next-intl';
import { RiskPicker } from '../_shared/RiskPicker';
import { AnalyticsState } from '../_shared/AnalyticsState';

interface Agg { nodeId: string; nodeName: string; riskCount: number; totalAle: number; children: Agg[] }

/** Flatten the roll-up tree into node options for the parent + link pickers. */
function flattenNodes(nodes: Agg[], depth = 0, out: ComboboxOption[] = []): ComboboxOption[] {
    for (const n of nodes) {
        out.push({ value: n.nodeId, label: `${'— '.repeat(depth)}${n.nodeName}` });
        if (n.children.length) flattenNodes(n.children, depth + 1, out);
    }
    return out;
}
const TYPES = [
    { value: 'BUSINESS_UNIT', labelKey: 'hierarchy.typeBusinessUnit' },
    { value: 'GEOGRAPHY', labelKey: 'hierarchy.typeGeography' },
    { value: 'ASSET_CLASS', labelKey: 'hierarchy.typeAssetClass' },
    { value: 'CUSTOM', labelKey: 'hierarchy.typeCustom' },
] as const;
// RQ3-OB-A — money speaks the tenant's currency (useMoneyFormatter).

function TreeRow({ node, depth, max }: { node: Agg; depth: number; max: number }) {
    const money = useMoneyFormatter();
    const t = useTranslations('risks');
    return (
        <>
            <div className="flex items-center gap-default py-tight text-sm" style={{ paddingLeft: `${depth * 16}px` }}>
                <span className="w-full sm:w-48 truncate text-content-emphasis">{node.nodeName}</span>
                <div className="flex-1">
                    <ProgressBar value={node.totalAle} max={max || 1} aria-label={t('hierarchy.aleShareAria', { name: node.nodeName })} />
                </div>
                <span className="w-24 sm:w-28 text-right tabular-nums text-content-muted">{money(node.totalAle)}</span>
                <span className="w-16 text-right tabular-nums text-content-subtle">{node.riskCount}</span>
            </div>
            {node.children.map((c) => <TreeRow key={c.nodeId} node={c} depth={depth + 1} max={max} />)}
        </>
    );
}

export default function RiskHierarchyPage() {
    const t = useTranslations('risks');
    const apiUrl = useTenantApiUrl();
    const money = useMoneyFormatter();
    const tenantHref = useTenantHref();
    const [type, setType] = useState('BUSINESS_UNIT');
    const treeQuery = useTenantSWR<{ treemap: Agg[] }>(`/risks/hierarchy?type=${type}`);
    const treemap = treeQuery.data?.treemap ?? [];
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    // P2 — build a real tree (parentId) and attach risks to nodes so the
    // roll-up is non-empty.
    const [parentId, setParentId] = useState<string | null>(null);
    const [linkNodeId, setLinkNodeId] = useState<string | null>(null);
    const [linkRiskId, setLinkRiskId] = useState<string | null>(null);
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkMsg, setLinkMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const load = () => treeQuery.mutate();

    const nodeOptions = flattenNodes(treemap);

    const addNode = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try { await fetch(apiUrl('/risks/hierarchy'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), type, parentId }) }); setName(''); setParentId(null); await load(); }
        finally { setBusy(false); }
    };

    const linkRisk = async () => {
        if (!linkNodeId || !linkRiskId) return;
        setLinkBusy(true); setLinkMsg(null);
        try {
            const res = await fetch(apiUrl(`/risks/hierarchy/${linkNodeId}/links`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ riskId: linkRiskId }),
            });
            if (res.ok) { setLinkMsg({ text: t('hierarchy.linkOk'), ok: true }); setLinkRiskId(null); await load(); }
            else { setLinkMsg({ text: t('hierarchy.linkFailed'), ok: false }); }
        } catch { setLinkMsg({ text: t('hierarchy.linkFailed'), ok: false }); }
        finally { setLinkBusy(false); }
    };

    const max = treemap.reduce((m, n) => Math.max(m, n.totalAle), 0);
    const total = treemap.reduce((s, n) => s + n.totalAle, 0);

    return (
        <div className="space-y-section">
            <BackAffordance />
            <PageBreadcrumbs items={[{ label: t('breadcrumbRoot'), href: tenantHref('/risks') }, { label: t('hierarchy.breadcrumb') }]} />
            <Heading level={1}>{t('hierarchy.title')}</Heading>

            <Card className="space-y-default p-6">
                <div className="flex flex-wrap gap-tight">
                    {TYPES.map((tt) => (
                        <Button key={tt.value} size="sm" variant={type === tt.value ? 'primary' : 'secondary'} onClick={() => setType(tt.value)}>{t(tt.labelKey)}</Button>
                    ))}
                </div>
                <div className="flex flex-wrap items-end gap-default">
                    <label className="block flex-1"><span className="text-xs text-content-muted">{t('hierarchy.newNodeName')}</span>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('hierarchy.newNodePlaceholder')} />
                    </label>
                    <label className="block w-full sm:w-48"><span className="text-xs text-content-muted">{t('hierarchy.parentLabel')}</span>
                        <Combobox
                            id="hierarchy-parent"
                            options={[{ value: '', label: t('hierarchy.parentNone') }, ...nodeOptions]}
                            selected={nodeOptions.find((o) => o.value === parentId) ?? { value: '', label: t('hierarchy.parentNone') }}
                            setSelected={(opt) => setParentId(opt && opt.value !== '' ? String(opt.value) : null)}
                            placeholder={t('hierarchy.parentNone')}
                        />
                    </label>
                    <Button variant="primary" onClick={addNode} disabled={busy || !name.trim()}>{t('hierarchy.addNode')}</Button>
                </div>

                {/* P2 — attach a risk to a node so the roll-up is non-empty. */}
                <div className="flex flex-wrap items-end gap-default border-t border-border-subtle pt-default">
                    <label className="block flex-1"><span className="text-xs text-content-muted">{t('hierarchy.linkRiskLabel')}</span>
                        <RiskPicker id="hierarchy-link-risk" value={linkRiskId} onChange={setLinkRiskId} placeholder={t('hierarchy.linkRiskPlaceholder')} />
                    </label>
                    <label className="block w-full sm:w-48"><span className="text-xs text-content-muted">{t('hierarchy.linkNodeLabel')}</span>
                        <Combobox
                            id="hierarchy-link-node"
                            options={nodeOptions}
                            selected={nodeOptions.find((o) => o.value === linkNodeId) ?? null}
                            setSelected={(opt) => setLinkNodeId(opt ? String(opt.value) : null)}
                            placeholder={t('hierarchy.linkNodePlaceholder')}
                        />
                    </label>
                    <Button variant="secondary" onClick={linkRisk} disabled={linkBusy || !linkNodeId || !linkRiskId}>{t('hierarchy.linkRisk')}</Button>
                </div>
                {linkMsg && <InlineNotice variant={linkMsg.ok ? 'success' : 'error'}>{linkMsg.text}</InlineNotice>}
            </Card>

            <Card className="space-y-default p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-tight">
                        <Heading level={2}>{t('hierarchy.rollup')}</Heading>
                        <InfoTooltip title={t('hierarchy.conceptTitle')} content={t('hierarchy.conceptHelp')} />
                    </div>
                    <span className="text-sm text-content-muted">{t('hierarchy.totalAleYr', { money: money(total) })}</span>
                </div>
                <AnalyticsState
                    isLoading={treeQuery.isLoading}
                    error={treeQuery.error}
                    isEmpty={treemap.length === 0}
                    emptyText={t('hierarchy.empty')}
                    errorText={t('hierarchy.loadError')}
                >
                    <div>
                        <div className="flex items-center gap-default border-b border-border-subtle pb-tight text-xs text-content-subtle">
                            <span className="w-full sm:w-48">{t('hierarchy.colNode')}</span><span className="flex-1">{t('hierarchy.colAleShare')}</span><span className="w-24 sm:w-28 text-right">{t('hierarchy.colTotalAle')}</span><span className="w-16 text-right">{t('hierarchy.colRisks')}</span>
                        </div>
                        {treemap.map((n) => <TreeRow key={n.nodeId} node={n} depth={0} max={max} />)}
                    </div>
                </AnalyticsState>
            </Card>
        </div>
    );
}
