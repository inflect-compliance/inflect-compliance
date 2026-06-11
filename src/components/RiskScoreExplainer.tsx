'use client';

/**
 * RQ2-3 — "why this number" popover for risk scores.
 *
 * Wrap any score chip:
 *
 *   <RiskScoreExplainer tenantSlug={slug} riskId={id}>
 *       <span>{score}</span>
 *   </RiskScoreExplainer>
 *
 * On open it lazy-fetches `/risks/:id/score-explanation` (never
 * eagerly — list pages render hundreds of chips) and answers
 * who / when / why / what-changed without navigation:
 *
 *   formula in the tenant's own language → band → control
 *   derivation (RQ2-2) → quant line (FAIR/SLE) → open appetite
 *   breaches → recent provenance events (RQ2-1, MIGRATION rows
 *   labelled honestly).
 *
 * One component for every surface — the structural ratchet at
 * tests/guardrails/risk-score-explainer.test.ts keeps score chips
 * from rendering bare.
 */

import { useState } from 'react';
import { Popover } from '@/components/ui/popover';
import { formatDateTime } from '@/lib/format-date';
import type { ScoreExplanation } from '@/app-layer/usecases/risk-score-explanation';

const SOURCE_LABEL: Record<string, string> = {
    USER: 'manual assessment',
    DERIVED: 'accepted control derivation',
    PLAN: 'treatment-plan completion',
    AI: 'accepted AI suggestion',
    MIGRATION: 'pre-provenance backfill',
};

export function RiskScoreExplainer({
    tenantSlug,
    riskId,
    label,
    children,
}: {
    tenantSlug: string;
    riskId: string;
    /**
     * Visible chip content (e.g. `"20 · High"`) — used to compose the
     * trigger's aria-label so screen-reader users hear the number and
     * band before "explain", not just the bare verb.
     */
    label?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<ScoreExplanation | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (next && !data && state !== 'loading') {
            setState('loading');
            fetch(`/api/t/${tenantSlug}/risks/${riskId}/score-explanation`)
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
                .then((d) => {
                    setData(d);
                    setState('idle');
                })
                .catch(() => setState('error'));
        }
    };

    return (
        <Popover
            openPopover={open}
            setOpenPopover={onOpenChange}
            align="start"
            content={
                <div
                    className="w-80 max-w-[90vw] p-3 text-xs space-y-default"
                    id={`score-explainer-${riskId}`}
                    role="region"
                    aria-label="Score explanation"
                >
                    {state === 'loading' && (
                        <p className="text-content-muted">Loading explanation…</p>
                    )}
                    {state === 'error' && (
                        <p className="text-content-muted">Couldn&apos;t load the explanation.</p>
                    )}
                    {data && (
                        <>
                            {/* Formula in the tenant's language */}
                            <div>
                                <p className="font-medium text-content-emphasis">
                                    Inherent {data.inherent.score}
                                    {data.inherent.bandName ? ` · ${data.inherent.bandName}` : ''}
                                </p>
                                <p className="text-content-muted">
                                    {data.inherent.likelihoodLabel ?? `Likelihood ${data.inherent.likelihood}`}
                                    {' × '}
                                    {data.inherent.impactLabel ?? `Impact ${data.inherent.impact}`}
                                    {` = ${data.inherent.likelihood} × ${data.inherent.impact}`}
                                </p>
                            </div>

                            {/* Residual */}
                            {data.residual && (
                                <div>
                                    <p className="font-medium text-content-emphasis">
                                        Residual {data.residual.score}
                                        {data.residual.bandName ? ` · ${data.residual.bandName}` : ''}
                                    </p>
                                    {data.residual.legacyUndecomposed && (
                                        <p className="text-content-muted">
                                            Set before decomposition — dimensions unknown (legacy formula).
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Control derivation */}
                            <div>
                                <p className="font-medium text-content-emphasis">Controls</p>
                                <p className="text-content-muted">{data.controls.summary}</p>
                                {data.controls.suggestedScore !== null &&
                                    data.controls.suggestedScore !== data.residual?.score && (
                                        <p className="text-content-muted">
                                            Current control stack suggests residual{' '}
                                            {data.controls.suggestedScore}.
                                        </p>
                                    )}
                            </div>

                            {/* Quant line */}
                            {data.quant && (
                                <p className="text-content-muted">{data.quant.line}</p>
                            )}

                            {/* Appetite breaches */}
                            {data.openBreaches.length > 0 && (
                                <p className="text-content-emphasis">
                                    {data.openBreaches.length} open appetite breach
                                    {data.openBreaches.length > 1 ? 'es' : ''} on this risk.
                                </p>
                            )}

                            {/* Provenance trail */}
                            {data.recentEvents.length > 0 && (
                                <div>
                                    <p className="font-medium text-content-emphasis">Recent changes</p>
                                    <ul className="space-y-tight">
                                        {data.recentEvents.map((e, i) => (
                                            <li key={i} className="text-content-muted">
                                                {e.kind === 'INHERENT' ? 'Inherent' : 'Residual'} → {e.score}{' '}
                                                ({SOURCE_LABEL[e.source] ?? e.source})
                                                {e.actorName ? ` by ${e.actorName}` : ''} ·{' '}
                                                {formatDateTime(e.createdAt)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            }
        >
            <button
                type="button"
                className="cursor-help bg-transparent border-0 p-0 text-inherit"
                aria-label={label ? `${label}, explain` : 'Explain this score'}
            >
                {children}
            </button>
        </Popover>
    );
}
