'use client';

/**
 * RQ2-4 — guided qualitative assessment: inherent → controls →
 * residual, in the tenant's own matrix language.
 *
 * The pre-RQ2 flow buried likelihood/impact in an edit modal and
 * left residual to a divisor formula. This panel makes assessment a
 * first-class surface:
 *
 *   Step 1 — Inherent. L/I steppers labelled with the tenant's
 *     `RiskMatrixConfig.levelLabels`; the band chip updates live so
 *     the assessor sees the consequence of each click before saving.
 *   Step 2 — Controls. The RQ2-2 contribution breakdown: which
 *     linked controls participate (MEASURED beats DECLARED), which
 *     are excluded and why — the data-quality nudge stays visible.
 *   Step 3 — Residual. Asserted vs control-suggested side by side.
 *     Accept recomputes SERVER-side (the POST body carries only a
 *     justification); manual override sends decomposed dims + a
 *     justification and the server derives the rollup (RQ2-1).
 *
 * The "Quantify this risk" bridge hands over to the FAIR tab — one
 * narrative, two depths; nothing here duplicates the quant inputs.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Eyebrow, Heading } from '@/components/ui/typography';
import { SkeletonCard } from '@/components/ui/skeleton';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { calculateRiskScore } from '@/lib/risk-scoring';
import { resolveBandForScore } from '@/lib/risk-matrix/scoring';
import type { RiskMatrixConfigShape } from '@/lib/risk-matrix/types';
import type { ResidualSuggestionPayload } from '@/app-layer/usecases/risk-residual-suggestion';

export interface AssessmentRisk {
    likelihood: number;
    impact: number;
    inherentScore: number;
    residualLikelihood: number | null;
    residualImpact: number | null;
    residualScore: number | null;
}

function BandChip({ score, config }: { score: number; config: RiskMatrixConfigShape }) {
    const band = resolveBandForScore(score, config.bands);
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums text-content-emphasis"
            style={{ backgroundColor: `${band.color}33` }}
            data-band={band.name}
        >
            <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: band.color }}
            />
            {score} · {band.name}
        </span>
    );
}

function levelLabel(config: RiskMatrixConfigShape, axis: 'likelihood' | 'impact', level: number): string {
    const label = config.levelLabels?.[axis]?.[level - 1];
    return label ? `${level} — ${label}` : String(level);
}

export function RiskAssessmentPanel({
    riskId,
    risk,
    canWrite,
    onRiskUpdated,
    onQuantify,
    onLinkControls,
}: {
    riskId: string;
    risk: AssessmentRisk;
    canWrite: boolean;
    /** Parent refetches the risk after any save here. */
    onRiskUpdated: () => void;
    /** Bridge to the Quantification (FAIR) tab. */
    onQuantify: () => void;
    /** Bridge to the Traceability tab (where controls are linked). */
    onLinkControls: () => void;
}) {
    const apiUrl = useTenantApiUrl();

    const [config, setConfig] = useState<RiskMatrixConfigShape | null>(null);
    const [suggestion, setSuggestion] = useState<ResidualSuggestionPayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Step 1 draft state.
    const [likelihood, setLikelihood] = useState(risk.likelihood);
    const [impact, setImpact] = useState(risk.impact);
    const [savingInherent, setSavingInherent] = useState(false);

    // Step 3 draft state.
    const [residualLikelihood, setResidualLikelihood] = useState(risk.residualLikelihood ?? risk.likelihood);
    const [residualImpact, setResidualImpact] = useState(risk.residualImpact ?? risk.impact);
    const [justification, setJustification] = useState('');
    const [overriding, setOverriding] = useState(false);
    const [savingResidual, setSavingResidual] = useState(false);
    const [accepting, setAccepting] = useState(false);

    const loadSuggestion = useCallback(async () => {
        const res = await fetch(apiUrl(`/risks/${riskId}/residual-suggestion`));
        if (!res.ok) throw new Error(`Failed to load control derivation (${res.status})`);
        setSuggestion(await res.json());
    }, [apiUrl, riskId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [configRes] = await Promise.all([
                    fetch(apiUrl('/risk-matrix-config')),
                    loadSuggestion(),
                ]);
                if (!configRes.ok) throw new Error(`Failed to load matrix config (${configRes.status})`);
                const cfg = await configRes.json();
                if (!cancelled) setConfig(cfg);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
            }
        })();
        return () => { cancelled = true; };
    }, [apiUrl, loadSuggestion]);

    if (error) {
        return <div className={cn(cardVariants({ density: 'compact' }), 'border-border-error text-content-error text-sm')}>{error}</div>;
    }
    if (!config || !suggestion) {
        return <SkeletonCard lines={4} />;
    }

    const maxScale = Math.max(config.likelihoodLevels, config.impactLevels);
    const draftInherentScore = calculateRiskScore(likelihood, impact, maxScale);
    const inherentDirty = likelihood !== risk.likelihood || impact !== risk.impact;
    const draftResidualScore = calculateRiskScore(residualLikelihood, residualImpact, maxScale);

    const saveInherent = async () => {
        setSavingInherent(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/risks/${riskId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ likelihood, impact }),
            });
            if (!res.ok) throw new Error(`Failed to save assessment (${res.status})`);
            onRiskUpdated();
            await loadSuggestion();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSavingInherent(false);
        }
    };

    const acceptSuggestion = async () => {
        setAccepting(true);
        setError(null);
        try {
            // Body carries ONLY the justification — values are
            // recomputed server-side (RQ2-2 contract).
            const res = await fetch(apiUrl(`/risks/${riskId}/residual-suggestion`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ justification: justification || null }),
            });
            if (!res.ok) throw new Error(`Failed to accept suggestion (${res.status})`);
            onRiskUpdated();
            await loadSuggestion();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to accept');
        } finally {
            setAccepting(false);
        }
    };

    const saveResidualOverride = async () => {
        setSavingResidual(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/risks/${riskId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    residualLikelihood,
                    residualImpact,
                    scoreJustification: justification || null,
                }),
            });
            if (!res.ok) throw new Error(`Failed to save residual (${res.status})`);
            setOverriding(false);
            onRiskUpdated();
            await loadSuggestion();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSavingResidual(false);
        }
    };

    const participating = suggestion.combined.contributions.filter((c) => c.affects !== null);
    const excluded = suggestion.combined.contributions.filter((c) => c.affects === null);

    return (
        <div className="space-y-section" id="risk-assessment-panel">
            {/* ── Step 1 — Inherent ─────────────────────────────── */}
            <div className={cn(cardVariants(), 'space-y-default')}>
                <div className="flex items-center justify-between">
                    <Heading level={3}>1 · Inherent assessment</Heading>
                    <BandChip score={draftInherentScore} config={config} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
                    <div>
                        <Eyebrow>{config.axisLikelihoodLabel || 'Likelihood'}</Eyebrow>
                        <NumberStepper
                            id="assessment-likelihood"
                            value={likelihood}
                            onChange={setLikelihood}
                            min={1}
                            max={config.likelihoodLevels}
                            disabled={!canWrite}
                            ariaLabel="Likelihood level"
                            formatValue={(v) => levelLabel(config, 'likelihood', v)}
                        />
                    </div>
                    <div>
                        <Eyebrow>{config.axisImpactLabel || 'Impact'}</Eyebrow>
                        <NumberStepper
                            id="assessment-impact"
                            value={impact}
                            onChange={setImpact}
                            min={1}
                            max={config.impactLevels}
                            disabled={!canWrite}
                            ariaLabel="Impact level"
                            formatValue={(v) => levelLabel(config, 'impact', v)}
                        />
                    </div>
                </div>
                {canWrite && inherentDirty && (
                    <div className="flex justify-end">
                        <Button
                            variant="secondary"
                            id="save-inherent-btn"
                            onClick={saveInherent}
                            disabled={savingInherent}
                        >
                            {savingInherent ? 'Saving…' : 'Save assessment'}
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Step 2 — Controls ─────────────────────────────── */}
            <div className={cn(cardVariants(), 'space-y-default')} id="assessment-controls">
                <Heading level={3}>2 · What your controls justify</Heading>
                <p className="text-sm text-content-muted">{suggestion.summary}</p>
                {participating.length > 0 && (
                    <ul className="space-y-tight">
                        {participating.map((c) => (
                            <li key={c.controlId} className="flex items-center gap-tight text-sm">
                                <span className="text-content-default">
                                    {c.code ? `${c.code} — ` : ''}{c.name}
                                </span>
                                <span className="text-content-muted">
                                    {c.effectiveness}% effective ({c.source === 'MEASURED' ? 'measured from tests' : 'declared'})
                                    {' → '}reduces {c.affects === 'LIKELIHOOD' ? 'likelihood' : 'impact'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {excluded.length > 0 && (
                    <div className="text-xs text-content-muted">
                        <Eyebrow>Not participating</Eyebrow>
                        <ul className="space-y-tight">
                            {excluded.map((c) => (
                                <li key={c.controlId}>
                                    {c.code ? `${c.code} — ` : ''}{c.name}:{' '}
                                    {c.excludedReason === 'NO_EFFECTIVENESS'
                                        ? 'no effectiveness signal (run a test or declare effectiveness)'
                                        : 'no mitigation type set'}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {suggestion.combined.contributions.length === 0 && (
                    <p className="text-sm text-content-muted">
                        No controls linked yet.{' '}
                        <button
                            type="button"
                            className="underline text-content-default"
                            onClick={onLinkControls}
                            id="assessment-link-controls"
                        >
                            Link controls in Traceability
                        </button>
                        {' '}to derive a residual from your control stack.
                    </p>
                )}
            </div>

            {/* ── Step 3 — Residual ─────────────────────────────── */}
            <div className={cn(cardVariants(), 'space-y-default')} id="assessment-residual">
                <Heading level={3}>3 · Residual</Heading>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
                    <div className={cn(cardVariants({ density: 'compact' }), 'space-y-tight')}>
                        <Eyebrow>Current (asserted)</Eyebrow>
                        {risk.residualScore !== null ? (
                            <>
                                <BandChip score={risk.residualScore} config={config} />
                                <p className="text-xs text-content-muted">
                                    {risk.residualLikelihood !== null && risk.residualImpact !== null
                                        ? `${levelLabel(config, 'likelihood', risk.residualLikelihood)} × ${levelLabel(config, 'impact', risk.residualImpact)}`
                                        : 'Set before decomposition — dimensions unknown (legacy formula).'}
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-content-muted">Not assessed yet.</p>
                        )}
                    </div>
                    <div className={cn(cardVariants({ density: 'compact' }), 'space-y-tight')}>
                        <Eyebrow>Suggested from controls</Eyebrow>
                        {suggestion.suggestion ? (
                            <>
                                <BandChip score={suggestion.suggestion.residualScore} config={config} />
                                <p className="text-xs text-content-muted">
                                    {levelLabel(config, 'likelihood', suggestion.suggestion.residualLikelihood)} ×{' '}
                                    {levelLabel(config, 'impact', suggestion.suggestion.residualImpact)}
                                </p>
                                {canWrite && (
                                    <Button
                                        variant="secondary"
                                        id="accept-suggestion-btn"
                                        onClick={acceptSuggestion}
                                        disabled={accepting}
                                    >
                                        {accepting ? 'Accepting…' : 'Accept suggestion'}
                                    </Button>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-content-muted">
                                No derivable residual — link controls with an effectiveness signal.
                            </p>
                        )}
                    </div>
                </div>

                {canWrite && !overriding && (
                    <Button variant="secondary" id="override-residual-btn" onClick={() => setOverriding(true)}>
                        Assess residual manually
                    </Button>
                )}
                {canWrite && overriding && (
                    <div className="space-y-default border-t border-border-subtle pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
                            <div>
                                <Eyebrow>Residual {config.axisLikelihoodLabel || 'likelihood'}</Eyebrow>
                                <NumberStepper
                                    id="residual-likelihood"
                                    value={residualLikelihood}
                                    onChange={setResidualLikelihood}
                                    min={1}
                                    max={config.likelihoodLevels}
                                    ariaLabel="Residual likelihood level"
                                    formatValue={(v) => levelLabel(config, 'likelihood', v)}
                                />
                            </div>
                            <div>
                                <Eyebrow>Residual {config.axisImpactLabel || 'impact'}</Eyebrow>
                                <NumberStepper
                                    id="residual-impact"
                                    value={residualImpact}
                                    onChange={setResidualImpact}
                                    min={1}
                                    max={config.impactLevels}
                                    ariaLabel="Residual impact level"
                                    formatValue={(v) => levelLabel(config, 'impact', v)}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-tight text-sm">
                            <span className="text-content-muted">Resulting score:</span>
                            <BandChip score={draftResidualScore} config={config} />
                        </div>
                        <FormField label="Justification">
                            <Input
                                id="residual-justification"
                                value={justification}
                                onChange={(e) => setJustification(e.target.value)}
                                placeholder="Why this residual differs from the derived suggestion"
                                maxLength={2000}
                            />
                        </FormField>
                        <div className="flex gap-tight justify-end">
                            <Button variant="secondary" onClick={() => setOverriding(false)}>Cancel</Button>
                            <Button
                                variant="secondary"
                                id="save-residual-btn"
                                onClick={saveResidualOverride}
                                disabled={savingResidual}
                            >
                                {savingResidual ? 'Saving…' : 'Save residual'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Quantify bridge ───────────────────────────────── */}
            <div className={cn(cardVariants({ density: 'compact' }), 'flex items-center justify-between')}>
                <p className="text-sm text-content-muted">
                    Need loss numbers instead of bands? Run the FAIR analysis on this risk.
                </p>
                <Button variant="secondary" id="quantify-bridge-btn" onClick={onQuantify}>
                    Quantify this risk
                </Button>
            </div>
        </div>
    );
}
