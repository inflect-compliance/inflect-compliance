'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';

// Mirror of the server SuggestionResult shape (policy-template-mapping.ts).
export interface SuggestedControlDTO {
    controlId: string;
    controlName: string;
    controlCode: string | null;
    requirements: { code: string; title: string; provenance: 'from_toolkit' | 'curated' }[];
    provenance: 'from_toolkit' | 'curated';
    preChecked: boolean;
}
export interface SuggestedFrameworkGroupDTO {
    frameworkKey: string;
    frameworkLabel: string;
    suggestions: SuggestedControlDTO[];
}
export interface SuggestionResultDTO {
    templateExternalRef: string;
    frameworks: SuggestedFrameworkGroupDTO[];
    totalSuggested: number;
}

interface Props {
    policyTitle: string;
    result: SuggestionResultDTO;
    /** Called with the chosen controlIds → caller POSTs the link + navigates. */
    onConfirm: (controlIds: string[]) => Promise<void>;
    /** Skip linking → navigate to the new policy. */
    onSkip: () => void;
}

export function TemplateControlSuggestModal({ policyTitle, result, onConfirm, onSkip }: Props) {
    // Pre-check from_toolkit suggestions; leave curated unchecked — the
    // tenant opts into our judgment explicitly.
    const [checked, setChecked] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const fw of result.frameworks) {
            for (const s of fw.suggestions) init[s.controlId] = s.preChecked;
        }
        return init;
    });
    const [submitting, setSubmitting] = useState(false);

    const selectedIds = useMemo(
        () => Object.entries(checked).filter(([, v]) => v).map(([id]) => id),
        [checked],
    );

    const toggle = (id: string) =>
        setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

    const handleConfirm = async () => {
        if (!selectedIds.length) { onSkip(); return; }
        setSubmitting(true);
        try {
            await onConfirm(selectedIds);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal showModal setShowModal={(o) => (o ? null : onSkip())}>
            <Modal.Header title={`Link "${policyTitle}" to suggested controls?`} />
            <Modal.Body>
                <div className="space-y-default">
                    <p className="text-sm text-content-muted">
                        This template maps to {result.totalSuggested} control
                        {result.totalSuggested === 1 ? '' : 's'} you already have installed.
                        These are <strong>suggestions</strong> — review before relying on
                        them for an audit. Linking a policy to a control records that the
                        policy contributes to satisfying it.
                    </p>

                    {result.frameworks.map((fw) => (
                        <div key={fw.frameworkKey} className="space-y-tight">
                            <Heading level={3} className="text-sm">{fw.frameworkLabel}</Heading>
                            <ul className="space-y-tight">
                                {fw.suggestions.map((s) => (
                                    <li
                                        key={s.controlId}
                                        className="flex items-start gap-compact rounded border border-border-subtle p-compact"
                                    >
                                        <Checkbox
                                            id={`suggest-${s.controlId}`}
                                            aria-label={`Link control ${s.controlName}`}
                                            checked={!!checked[s.controlId]}
                                            onCheckedChange={() => toggle(s.controlId)}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-tight flex-wrap">
                                                <span className="text-sm font-medium">
                                                    {s.controlCode ? `${s.controlCode} — ` : ''}{s.controlName}
                                                </span>
                                                <StatusBadge variant={s.provenance === 'from_toolkit' ? 'info' : 'neutral'}>
                                                    {s.provenance === 'from_toolkit' ? 'suggested (toolkit)' : 'suggested (curated)'}
                                                </StatusBadge>
                                            </div>
                                            <p className="text-xs text-content-subtle mt-0.5">
                                                Satisfies {s.requirements.map((r) => r.code).join(', ')}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    <p className="text-xs text-content-subtle italic">
                        Curated mappings are our judgment, not an authoritative compliance
                        claim — they start unchecked so you opt in explicitly.
                    </p>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Modal.Actions>
                    <Button variant="ghost" onClick={onSkip} disabled={submitting} id="suggest-skip">
                        Skip
                    </Button>
                    <Button variant="primary" onClick={handleConfirm} disabled={submitting} id="suggest-confirm">
                        {submitting ? 'Linking…' : `Link ${selectedIds.length} control${selectedIds.length === 1 ? '' : 's'}`}
                    </Button>
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}
