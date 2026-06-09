'use client';

/**
 * RQ-1 — FAIR Analysis panel on the risk detail page.
 *
 * Structured FAIR inputs (TEF / vulnerability / loss magnitude /
 * secondary loss) with a LIVE client-side ALE preview (the pure
 * `fair-calculator` runs in the browser). On save the server recomputes
 * + persists the derived LEF/ALE via PUT /risks/:id/fair.
 */
import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Heading } from '@/components/ui/typography';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import {
    computeTEF,
    computeVulnerability,
    computeLEF,
    computePLM,
    computeFairALE,
} from '@/app-layer/usecases/fair-calculator';

type Conf = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FairInitial {
    threatEventFrequency: number | null;
    contactFrequency: number | null;
    probabilityOfAction: number | null;
    vulnerabilityProbability: number | null;
    threatCapability: number | null;
    controlStrength: number | null;
    primaryLossMagnitude: number | null;
    productivityLoss: number | null;
    responseCost: number | null;
    replacementCost: number | null;
    secondaryLossEventFrequency: number | null;
    secondaryLossMagnitude: number | null;
    fairConfidence: Conf | null;
}

type FieldKey = Exclude<keyof FairInitial, 'fairConfidence'>;
const N = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function FairAnalysisPanel({ riskId, initial }: { riskId: string; initial: FairInitial }) {
    const apiUrl = useTenantApiUrl();
    const [v, setV] = useState<FairInitial>(initial);
    const [conf, setConf] = useState<Conf | null>(initial.fairConfidence);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setV((cur) => ({ ...cur, [k]: N(e.target.value) }));

    // Live derived values (mirror the server's recomputeFairDerived).
    const derived = useMemo(() => {
        const tef = v.threatEventFrequency ??
            (v.contactFrequency != null && v.probabilityOfAction != null
                ? computeTEF(v.contactFrequency, v.probabilityOfAction) : null);
        const vuln = v.vulnerabilityProbability ??
            (v.threatCapability != null && v.controlStrength != null
                ? computeVulnerability(v.threatCapability, v.controlStrength) : null);
        if (tef == null || vuln == null) return { tef, vuln, lef: null as number | null, ale: null as number | null };
        const lef = computeLEF(tef, vuln);
        const plm = computePLM({ productivityLoss: v.productivityLoss, responseCost: v.responseCost, replacementCost: v.replacementCost, flatEstimate: v.primaryLossMagnitude });
        const ale = computeFairALE({ tef, vulnerability: vuln, plm, slef: v.secondaryLossEventFrequency ?? 0, slm: v.secondaryLossMagnitude ?? 0 });
        return { tef, vuln, lef, ale };
    }, [v]);

    const save = useCallback(async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(apiUrl(`/risks/${riskId}/fair`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...v, fairConfidence: conf }),
            });
            setMsg(res.ok ? 'FAIR inputs saved.' : 'Save failed.');
        } catch {
            setMsg('Save failed — network error.');
        } finally {
            setSaving(false);
        }
    }, [apiUrl, riskId, v, conf]);

    const field = (label: string, k: FieldKey, hint?: string) => (
        <label className="block">
            <span className="text-xs text-content-muted">{label}{hint ? ` (${hint})` : ''}</span>
            <Input type="text" inputMode="decimal" value={v[k] ?? ''} onChange={set(k)} />
        </label>
    );
    const group = (title: string, children: React.ReactNode) => (
        <div className="space-y-tight rounded-md border border-border-subtle p-3">
            <p className="text-xs font-medium text-content-emphasis">{title}</p>
            {children}
        </div>
    );

    return (
        <Card className="space-y-default p-6">
            <Heading level={3}>FAIR Analysis</Heading>
            <p className="text-sm text-content-muted">
                Decompose this risk into Factor Analysis of Information Risk inputs for quantitative simulation.
            </p>

            <div className="grid grid-cols-1 gap-default md:grid-cols-2">
                {group('Threat Event Frequency', <>
                    {field('Contact frequency', 'contactFrequency', '/yr')}
                    {field('P(action)', 'probabilityOfAction', '0–1')}
                    {field('TEF (override)', 'threatEventFrequency', '/yr')}
                </>)}
                {group('Vulnerability', <>
                    {field('Threat capability', 'threatCapability', '1–10')}
                    {field('Control strength', 'controlStrength', '1–10')}
                    {field('Vulnerability (override)', 'vulnerabilityProbability', '0–1')}
                </>)}
                {group('Primary Loss Magnitude', <>
                    {field('Productivity', 'productivityLoss', '$')}
                    {field('Response', 'responseCost', '$')}
                    {field('Replacement', 'replacementCost', '$')}
                    {field('PLM (flat override)', 'primaryLossMagnitude', '$')}
                </>)}
                {group('Secondary Loss', <>
                    {field('SLEF', 'secondaryLossEventFrequency', '0–1')}
                    {field('SLM', 'secondaryLossMagnitude', '$')}
                </>)}
            </div>

            <div className="flex flex-wrap items-center gap-default">
                <span className="text-xs text-content-muted">Confidence:</span>
                {(['LOW', 'MEDIUM', 'HIGH'] as Conf[]).map((c) => (
                    <Button key={c} size="sm" variant={conf === c ? 'secondary' : 'ghost'} onClick={() => setConf(c)}>
                        {c}
                    </Button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-default rounded-md border border-border-default bg-bg-subtle p-3 text-sm">
                <span>LEF: <span className="font-semibold tabular-nums">{derived.lef != null ? `${derived.lef.toFixed(2)}/yr` : '—'}</span></span>
                <span className="ml-auto">FAIR ALE: <span className="font-semibold tabular-nums text-content-emphasis">{derived.ale != null ? `${money(derived.ale)}/yr` : '—'}</span></span>
            </div>

            {msg && <InlineNotice variant={msg.includes('saved') ? 'success' : 'error'}>{msg}</InlineNotice>}
            <div className="flex justify-end">
                <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save FAIR inputs'}</Button>
            </div>
        </Card>
    );
}
