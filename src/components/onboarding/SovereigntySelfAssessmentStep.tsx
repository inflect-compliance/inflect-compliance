'use client';

/**
 * Digital Sovereignty Posture self-assessment onboarding step (DS-2).
 *
 * Renders the 30-question Digital Sovereignty Posture bank (6 dimensions × 5
 * questions) grouped by dimension, scored 0 (none) → 4 (leading). Everything is
 * STATELESS + client-held: the pure content bank and the isomorphic scorer
 * (`@/lib/self-assessments/scoring`) are imported directly and score live in
 * the browser — there is no server round-trip until the user MATERIALISES the
 * approved gaps. Shown by <OnboardingWizard> only when an EU digital-regulation
 * framework (NIS2 / DORA / EU AI Act) is selected.
 *
 * Propose-not-commit: below-threshold dimensions surface a suggested risk +
 * control; nothing is written until the user approves the "Create these?" list
 * and the server re-scores. This is a self-assessment AID, NOT legal advice.
 */
import { useMemo, useState } from 'react';

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { InfoTooltip } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui/status-badge';
import { KPIStat } from '@/components/ui/metric';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/icons/loading-spinner';
import {
    DIGITAL_SOVEREIGNTY_ASSESSMENT,
    type SelfAssessmentDimension,
} from '@/data/self-assessments/digital-sovereignty';
import {
    scoreSelfAssessment,
    buildGapSuggestions,
    type SelfAssessmentAnswers,
} from '@/lib/self-assessments/scoring';

const SOVEREIGNTY_DISCLAIMER =
    'This is a self-assessment aid, NOT legal advice. EU sovereignty, residency and jurisdiction determinations are legal calls owned by your counsel.';
const SOVEREIGNTY_ATTRIBUTION =
    'The six-dimension model derives from the MIT-licensed Digital-Sovereignty-Assessment-Tool; regulatory material is clause-referenced, never reproduced.';

/** Human labels for the data bank's i18n `labelKey`s (onboarding steps render
 *  hard-coded English, mirroring the sibling NIS2 / AI-governance steps). */
const DIMENSION_LABELS: Record<string, string> = {
    cloudJurisdiction: 'Cloud Jurisdiction & Sovereign Cloud',
    dataResidency: 'Data Residency & Transfer Mechanisms',
    identitySovereignty: 'Identity & Sovereignty of Access',
    infraExitReadiness: 'Infrastructure Dependency & Exit-Readiness',
    regulatoryAlignment: 'Regulatory Alignment & Certification',
    sovereignAi: 'Sovereign AI',
};

function dimLabel(dim: SelfAssessmentDimension): string {
    return DIMENSION_LABELS[dim.labelKey] ?? dim.labelKey;
}

type Approval = { createRisk: boolean; createControl: boolean };

export function SovereigntySelfAssessmentStep({
    tenantSlug,
    onCompleted,
    onSkip,
}: {
    tenantSlug: string;
    onCompleted?: () => void;
    onSkip?: () => void;
}) {
    const assessment = DIGITAL_SOVEREIGNTY_ASSESSMENT;
    const [answers, setAnswers] = useState<SelfAssessmentAnswers>({});
    // Per-dimension approval — defaults to both on for a surfaced gap.
    const [approvals, setApprovals] = useState<Record<number, Approval>>({});
    const [materializing, setMaterializing] = useState(false);
    const [materializeMsg, setMaterializeMsg] = useState<string | null>(null);
    const [completing, setCompleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmSkip, setConfirmSkip] = useState(false);

    // Live client-side score — the SAME pure module the server re-runs.
    const score = useMemo(() => scoreSelfAssessment(assessment, answers), [assessment, answers]);
    const gaps = useMemo(() => buildGapSuggestions(assessment, score), [assessment, score]);

    const setAnswer = (questionId: string, value: number) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const approvalFor = (dimensionId: number): Approval =>
        approvals[dimensionId] ?? { createRisk: true, createControl: true };

    const setApproval = (dimensionId: number, patch: Partial<Approval>) => {
        setApprovals((prev) => ({ ...prev, [dimensionId]: { ...approvalFor(dimensionId), ...patch } }));
    };

    const handleMaterialize = async () => {
        setMaterializing(true);
        setMaterializeMsg(null);
        setError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/onboarding/sovereignty-assessment/materialize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: assessment.key,
                    answers,
                    approvals: gaps.map((g) => ({
                        dimensionId: g.dimensionId,
                        createRisk: approvalFor(g.dimensionId).createRisk,
                        createControl: approvalFor(g.dimensionId).createControl,
                    })),
                }),
            });
            if (!res.ok) throw new Error('Failed to create risks and controls.');
            const data: { createdRiskIds: string[]; createdControlIds: string[]; skipped: number } = await res.json();
            const r = data.createdRiskIds.length;
            const c = data.createdControlIds.length;
            setMaterializeMsg(
                r + c === 0
                    ? 'Nothing new to create — your approved gaps already exist.'
                    : `Created ${r} risk${r === 1 ? '' : 's'} and ${c} control${c === 1 ? '' : 's'} from your gaps.`,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create risks and controls.');
        } finally {
            setMaterializing(false);
        }
    };

    const handleComplete = async () => {
        setCompleting(true);
        try {
            onCompleted?.();
        } finally {
            setCompleting(false);
        }
    };

    const overallLabel = score.overall100 == null ? '—' : `${score.overall100}`;
    const bandLabel = score.band ?? '—';

    return (
        <div className="space-y-section" data-testid="sovereignty-self-assessment">
            <div className="space-y-tight">
                <p className="text-sm text-content-muted">
                    Six sovereignty dimensions — jurisdiction, residency, identity,
                    exit-readiness, regulatory alignment and sovereign AI. Score each
                    question from none (0) to leading (4); weak dimensions surface a
                    suggested risk + control you can approve at the end. Nothing is
                    saved until you create it.
                </p>
            </div>

            {/* Summary cards — a posture badge, NOT a compliance claim. */}
            <div className="grid grid-cols-1 gap-default sm:grid-cols-3" data-testid="sovereignty-summary-cards">
                <KPIStat value={`${overallLabel}${score.overall100 == null ? '' : '/100'}`} label="Sovereignty posture" data-testid="sovereignty-overall" />
                <KPIStat value={bandLabel} label="Maturity band" data-testid="sovereignty-band" />
                <KPIStat value={`${score.answered}/${score.total}`} label="Questions answered" data-testid="sovereignty-answered" />
            </div>

            {gaps.length > 0 && (
                <div
                    className="rounded-lg border border-border-emphasis bg-bg-subtle px-3 py-2 text-sm text-content-default"
                    data-testid="sovereignty-gap-count"
                >
                    <strong>{gaps.length} weak dimension{gaps.length === 1 ? '' : 's'}</strong>{' '}
                    below the gap threshold. Review the suggested risks + controls below before creating them.
                </div>
            )}

            {error && <p className="text-sm text-content-error">{error}</p>}

            {/* The questions, grouped by dimension. */}
            <Accordion type="multiple" className="space-y-tight">
                {assessment.dimensions.map((dim) => {
                    const answered = dim.questions.filter((q) => typeof answers[q.id] === 'number').length;
                    const dimScore = score.dimensions.find((d) => d.id === dim.id);
                    const isGap = dimScore?.mean != null && gaps.some((g) => g.dimensionId === dim.id);
                    return (
                        <AccordionItem key={dim.id} value={String(dim.id)}>
                            <AccordionTrigger>
                                <span className="flex items-center gap-compact text-left">
                                    <StatusBadge variant="neutral" size="sm">D{dim.id}</StatusBadge>
                                    <span className="font-medium">{dimLabel(dim)}</span>
                                    <span className="text-xs text-content-muted">{answered}/{dim.questions.length}</span>
                                    {isGap && <StatusBadge variant="warning" size="sm">Gap</StatusBadge>}
                                </span>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-default">
                                    {dim.questions.map((q) => {
                                        const current = answers[q.id];
                                        return (
                                            <div
                                                key={q.id}
                                                data-testid={`sovereignty-question-${q.id}`}
                                                className="rounded-lg border border-border-subtle p-3 space-y-tight"
                                            >
                                                <div className="flex items-start gap-tight flex-wrap">
                                                    <span className="text-sm text-content-default flex-1 min-w-[12rem]">
                                                        {q.text}
                                                    </span>
                                                    <InfoTooltip
                                                        content={`References: ${dim.clauseRefs.join(', ')}`}
                                                        aria-label="Show the clause references"
                                                    />
                                                </div>
                                                <RadioGroup
                                                    className="flex flex-wrap gap-compact"
                                                    value={current == null ? '' : String(current)}
                                                    onValueChange={(v) => setAnswer(q.id, Number(v))}
                                                >
                                                    {q.options.map((opt) => (
                                                        <label key={opt.score} className="flex items-center gap-tight text-sm cursor-pointer">
                                                            <RadioGroupItem value={String(opt.score)} />
                                                            {opt.label}
                                                        </label>
                                                    ))}
                                                </RadioGroup>
                                            </div>
                                        );
                                    })}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>

            {/* Approve-and-create — the propose→commit boundary. */}
            {gaps.length > 0 && (
                <div className="space-y-default rounded-lg border border-border-subtle p-4" data-testid="sovereignty-suggestions">
                    <p className="text-sm font-medium text-content-emphasis">Create these? (below-threshold dimensions)</p>
                    <div className="space-y-tight">
                        {gaps.map((g) => {
                            const a = approvalFor(g.dimensionId);
                            return (
                                <div key={g.dimensionId} className="rounded-md border border-border-subtle p-3 space-y-tight" data-testid={`sovereignty-suggestion-${g.dimensionId}`}>
                                    <div className="flex items-center gap-tight flex-wrap">
                                        <span className="text-sm font-medium">{DIMENSION_LABELS[g.labelKey] ?? g.labelKey}</span>
                                        <StatusBadge variant="neutral" size="sm">{g.clauseRef}</StatusBadge>
                                    </div>
                                    <label className="flex items-start gap-tight text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            checked={a.createRisk}
                                            onChange={(e) => setApproval(g.dimensionId, { createRisk: e.target.checked })}
                                        />
                                        <span>Risk — <span className="text-content-muted">{g.riskTitle}</span></span>
                                    </label>
                                    <label className="flex items-start gap-tight text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            checked={a.createControl}
                                            onChange={(e) => setApproval(g.dimensionId, { createControl: e.target.checked })}
                                        />
                                        <span>Control — <span className="text-content-muted">{g.controlName}</span></span>
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between gap-compact border-t border-border-subtle pt-4">
                {confirmSkip ? (
                    <div className="flex items-center gap-tight text-sm">
                        <span className="text-content-muted">You can complete this later.</span>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(false)}>Keep going</Button>
                        <Button variant="secondary" size="sm" onClick={() => onSkip?.()}>Skip for now</Button>
                    </div>
                ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(true)}>Skip for now</Button>
                )}
                <div className="flex items-center gap-tight">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleMaterialize}
                        disabled={materializing || gaps.length === 0}
                        data-testid="sovereignty-materialize"
                    >
                        {materializing ? <LoadingSpinner className="w-3.5 h-3.5" /> : null}
                        Create risks + controls
                    </Button>
                    <Button variant="primary" onClick={handleComplete} disabled={completing} data-testid="sovereignty-complete">
                        {completing ? <LoadingSpinner className="w-3.5 h-3.5" /> : null}
                        Complete assessment
                    </Button>
                </div>
            </div>
            {materializeMsg && <p className="text-xs text-content-muted" data-testid="sovereignty-materialize-msg">{materializeMsg}</p>}

            {/* Attribution + the not-legal-advice disclaimer. */}
            <div className="space-y-tight">
                <p className="text-xs text-content-subtle" data-testid="sovereignty-disclaimer">{SOVEREIGNTY_DISCLAIMER}</p>
                <p className="text-xs text-content-subtle">{SOVEREIGNTY_ATTRIBUTION}</p>
            </div>
        </div>
    );
}
