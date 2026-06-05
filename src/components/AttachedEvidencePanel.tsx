'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- self-contained
 * panel consuming server-rendered evidence rows + form events. */

/**
 * Attached-evidence panel — the writable, Control-style evidence
 * surface for a Risk or Asset detail page. Mirrors the Control / Task
 * Evidence tab: upload a file OR link a URL, both scoped to the entity
 * via `Evidence.riskId` / `Evidence.assetId`, rendered through the
 * shared <EvidenceSubTable>.
 *
 * This is DISTINCT from `<InheritedEvidencePanel>` (read-only evidence
 * aggregated from the entity's mapped controls). The Risk/Asset Evidence
 * tab stacks both: this panel for attached evidence, the inherited panel
 * below it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useToastWithUndo } from '@/components/ui/hooks';
import {
    EvidenceSubTable,
    type EvidenceTabData,
} from '@/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/EvidenceSubTable';

interface AttachedEvidencePanelProps {
    /** Risk or asset id. */
    entityId: string;
    /** Drives the upload field name + element ids + copy. */
    entity: 'risk' | 'asset';
    /**
     * Attached-evidence endpoint WITHOUT the `/api/t/<slug>` prefix —
     * e.g. `/risks/<id>/evidence/attached`. GET returns
     * `{ links, evidence }`; POST links a URL; DELETE `${endpoint}/<id>`
     * detaches.
     */
    endpoint: string;
    apiUrl: (path: string) => string;
    tenantHref: (path: string) => string;
    canWrite: boolean;
}

export function AttachedEvidencePanel({
    entityId,
    entity,
    endpoint,
    apiUrl,
    tenantHref,
    canWrite,
}: AttachedEvidencePanelProps) {
    const triggerUndoToast = useToastWithUndo();
    const [data, setData] = useState<EvidenceTabData | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const [showForm, setShowForm] = useState(false);
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [fileTitle, setFileTitle] = useState('');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const uploadField = entity === 'risk' ? 'riskId' : 'assetId';

    const refetch = useCallback(async () => {
        try {
            const res = await fetch(apiUrl(endpoint));
            if (!res.ok) throw new Error('load failed');
            setData(await res.json());
            setError(false);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, endpoint]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState lands async inside refetch (mirrors InheritedEvidencePanel).
        void refetch();
    }, [refetch]);

    const resetForm = () => {
        setUrl('');
        setNote('');
        setFile(null);
        setFileTitle('');
        setFormError('');
        if (fileRef.current) fileRef.current.value = '';
        setShowForm(false);
    };

    // Unified add — a chosen file uploads via /evidence/uploads (tagged
    // with this entity); otherwise a non-empty URL links a LINK row.
    const addEvidence = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (file) {
            setSaving(true);
            try {
                const fd = new FormData();
                fd.append('file', file);
                if (fileTitle) fd.append('title', fileTitle);
                fd.append(uploadField, entityId);
                const res = await fetch(apiUrl('/evidence/uploads'), {
                    method: 'POST',
                    body: fd,
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || err.message || 'Upload failed');
                }
                resetForm();
                await refetch();
            } catch (err: unknown) {
                setFormError(err instanceof Error ? err.message : 'Upload failed');
            } finally {
                setSaving(false);
            }
            return;
        }
        if (!url.trim()) {
            setFormError('Choose a file to upload, or enter an evidence URL.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(apiUrl(endpoint), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), note: note || undefined }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || 'Failed to link evidence');
            }
            resetForm();
            await refetch();
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : 'Failed to link evidence');
        } finally {
            setSaving(false);
        }
    };

    // Epic 67 — delayed-commit removal (detach the FK). Optimistic
    // filter, undo restores, commit-failure rolls back.
    const removeEvidence = (evidenceId: string) => {
        const previous = data;
        setData((prev) =>
            prev
                ? { ...prev, evidence: (prev.evidence ?? []).filter((ev: any) => ev.id !== evidenceId) }
                : prev,
        );
        triggerUndoToast({
            message: 'Evidence removed',
            undoMessage: 'Undo',
            action: async () => {
                const res = await fetch(apiUrl(`${endpoint}/${evidenceId}`), {
                    method: 'DELETE',
                });
                if (!res.ok) throw new Error('Remove evidence failed');
                await refetch();
            },
            undoAction: () => setData(previous),
            onError: () => setData(previous),
        });
    };

    return (
        <div className="space-y-default" data-testid={`${entity}-attached-evidence`}>
            {canWrite && (
                <div className="flex justify-end">
                    <Button
                        variant="secondary"
                        onClick={() => setShowForm(!showForm)}
                        id={`add-${entity}-evidence-btn`}
                    >
                        Add Evidence
                    </Button>
                </div>
            )}
            {showForm && canWrite && (
                <form
                    onSubmit={addEvidence}
                    className={cn(cardVariants({ density: 'compact' }), 'space-y-compact')}
                >
                    {formError && (
                        <div
                            className="rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            role="alert"
                        >
                            {formError}
                        </div>
                    )}
                    <FormField label="Upload file">
                        <input
                            ref={fileRef}
                            type="file"
                            className="block w-full text-sm text-content-muted file:mr-3 file:rounded-md file:border-0 file:bg-bg-muted file:px-3 file:py-1.5 file:text-sm file:text-content-default"
                            onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                setFile(f);
                                if (f && !fileTitle) setFileTitle(f.name);
                            }}
                        />
                    </FormField>
                    {file && (
                        <FormField label="Title">
                            <input
                                className="input w-full"
                                value={fileTitle}
                                onChange={(e) => setFileTitle(e.target.value)}
                                placeholder="Evidence title"
                            />
                        </FormField>
                    )}
                    <div className="text-xs text-content-subtle">— or link a URL —</div>
                    <FormField label="Evidence URL">
                        <input
                            className="input w-full"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://…"
                            disabled={!!file}
                        />
                    </FormField>
                    <FormField label="Note">
                        <input
                            className="input w-full"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Optional note"
                            disabled={!!file}
                        />
                    </FormField>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={saving}
                        id={`submit-${entity}-evidence-btn`}
                    >
                        {saving ? 'Saving…' : 'Add Evidence'}
                    </Button>
                </form>
            )}
            {error ? (
                <InlineEmptyState
                    title="Couldn't load evidence"
                    description="Something went wrong fetching attached evidence. Reload the page to try again."
                />
            ) : (
                <EvidenceSubTable
                    data={data}
                    loading={loading && !data}
                    canWrite={canWrite}
                    onUnlink={() => {}}
                    onUnlinkEvidence={removeEvidence}
                    tenantHref={tenantHref}
                />
            )}
        </div>
    );
}
