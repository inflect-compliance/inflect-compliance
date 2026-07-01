'use client';

/**
 * Assessment pre-fill panel — the human review surface for AI-proposed
 * answers from a vendor document (SOC 2 / ISO / pen-test).
 *
 * Flow: pick a document → "Pre-fill" runs the extraction → the proposed
 * answers render with their SOURCE CITATION + confidence, each with
 * Approve / Reject. Approving is the ONLY thing that writes a real answer
 * (propose-not-commit) — the panel makes that explicit. An expired SOC 2
 * period is flagged so a reviewer weighs the freshness.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface VendorDoc { id: string; type: string; title: string | null }
interface Proposal {
    id: string;
    questionId: string | null;
    proposedAnswerJson: unknown;
    confidence: string;
    sourceCitation: string;
    status: string;
}
interface Extraction {
    id: string;
    reportType: string | null;
    auditPeriodStart: string | null;
    auditPeriodEnd: string | null;
    status: string;
    proposals: Proposal[];
}

const CONFIDENCE_VARIANT: Record<string, StatusBadgeVariant> = { high: 'success', medium: 'warning', low: 'neutral' };

function isExpired(end: string | null): boolean {
    return !!end && new Date(end).getTime() < Date.now();
}
function proposedValue(json: unknown): string {
    if (json && typeof json === 'object' && 'value' in json) return String((json as { value: unknown }).value);
    return '—';
}

export function AssessmentPrefillPanel({
    tenantSlug,
    vendorId,
    assessmentId,
    onApplied,
}: {
    tenantSlug: string;
    vendorId: string;
    assessmentId: string;
    onApplied: () => void;
}) {
    const apiUrl = useCallback((p: string) => `/api/t/${tenantSlug}${p}`, [tenantSlug]);
    const [docs, setDocs] = useState<VendorDoc[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<string>('');
    const [extraction, setExtraction] = useState<Extraction | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        fetch(apiUrl(`/vendors/${vendorId}/documents`))
            .then((r) => (r.ok ? r.json() : []))
            .then((rows: VendorDoc[]) => {
                setDocs(rows);
                if (rows[0]) setSelectedDoc(rows[0].id);
            })
            .catch(() => { /* ignore */ });
    }, [apiUrl, vendorId]);

    const runExtract = useCallback(async () => {
        if (!selectedDoc) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/vendors/${vendorId}/documents/${selectedDoc}/extract`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assessmentId }),
            });
            if (!res.ok) throw new Error('Extraction failed');
            const { extractionId } = (await res.json()) as { extractionId: string };
            const detail = await fetch(apiUrl(`/vendor-extractions/${extractionId}`));
            setExtraction((await detail.json()) as Extraction);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Extraction failed');
        } finally {
            setBusy(false);
        }
    }, [apiUrl, vendorId, selectedDoc, assessmentId]);

    const decide = useCallback(
        async (proposalId: string, action: 'approve' | 'reject') => {
            setPendingId(proposalId);
            try {
                const res = await fetch(apiUrl(`/vendor-proposals/${proposalId}/${action}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                if (!res.ok) throw new Error();
                setExtraction((e) =>
                    e ? { ...e, proposals: e.proposals.map((p) => (p.id === proposalId ? { ...p, status: action === 'approve' ? 'ACCEPTED' : 'REJECTED' } : p)) } : e,
                );
                if (action === 'approve') onApplied();
            } catch {
                setError('Could not update the proposal');
            } finally {
                setPendingId(null);
            }
        },
        [apiUrl, onApplied],
    );

    const docOptions = docs.map((d) => ({ value: d.id, label: d.title || d.type }));
    const pending = extraction?.proposals.filter((p) => p.status === 'PENDING') ?? [];

    return (
        <div className={cn(cardVariants({ density: 'none' }), 'space-y-default')} data-testid="assessment-prefill-panel">
            <div>
                <Heading level={3}>Pre-fill from a document</Heading>
                <p className="text-xs text-content-muted">
                    AI reads a SOC 2 / ISO / pen-test report and proposes cited answers. Nothing is scored until you approve.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-compact">
                <div className="min-w-[16rem]">
                    <span className="mb-1 block text-xs text-content-muted">Document</span>
                    <Combobox
                        id="prefill-doc-select"
                        name="document"
                        options={docOptions}
                        selected={docOptions.find((o) => o.value === selectedDoc) ?? null}
                        setSelected={(o) => setSelectedDoc(o?.value ?? '')}
                        placeholder={docs.length === 0 ? 'No documents uploaded' : 'Select a document…'}
                        hideSearch
                        matchTriggerWidth
                        caret
                        buttonProps={{ className: 'w-full' }}
                    />
                </div>
                <Button variant="primary" size="sm" onClick={runExtract} disabled={busy || !selectedDoc}>
                    {busy ? 'Reading…' : 'Pre-fill'}
                </Button>
            </div>

            {error && <p className="text-sm text-content-error">{error}</p>}

            {extraction && (
                <div className="space-y-tight">
                    <div className="flex flex-wrap items-center gap-tight text-xs">
                        <StatusBadge variant="info">{extraction.reportType ?? 'Unknown report'}</StatusBadge>
                        {extraction.auditPeriodEnd && (
                            <span className="text-content-muted">
                                period → {extraction.auditPeriodEnd.slice(0, 10)}
                            </span>
                        )}
                        {isExpired(extraction.auditPeriodEnd) && <StatusBadge variant="warning">Report period expired</StatusBadge>}
                    </div>

                    {pending.length === 0 ? (
                        <p className="text-sm text-content-subtle">
                            No proposed answers{extraction.status === 'FAILED' ? ' — the AI extraction did not succeed.' : ' from this document.'}
                        </p>
                    ) : (
                        <ul className="space-y-tight">
                            {pending.map((p) => (
                                <li key={p.id} className="flex items-start justify-between gap-compact border-t border-border-subtle pt-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-tight">
                                            <span className="text-sm font-medium text-content-default">Proposed: {proposedValue(p.proposedAnswerJson)}</span>
                                            <StatusBadge variant={CONFIDENCE_VARIANT[p.confidence] ?? 'neutral'}>{p.confidence}</StatusBadge>
                                        </div>
                                        <p className="text-xs text-content-subtle">{p.sourceCitation}</p>
                                    </div>
                                    <div className="flex shrink-0 gap-tight">
                                        <Button variant="secondary" size="sm" disabled={pendingId === p.id} onClick={() => decide(p.id, 'approve')}>
                                            Approve
                                        </Button>
                                        <Button variant="ghost" size="sm" disabled={pendingId === p.id} onClick={() => decide(p.id, 'reject')}>
                                            Reject
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
