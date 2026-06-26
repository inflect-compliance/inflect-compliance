'use client';

/**
 * Canonical drag-and-drop evidence uploader for the entity quick-view panels
 * and detail evidence sections (control / task / risk / asset). Wraps the
 * shared `<FileDropzone>` and links each uploaded file to its parent entity
 * in the SAME upload POST (`/evidence/uploads` accepts
 * `controlId`/`taskId`/`riskId`/`assetId`). Replaces the old `<input
 * type="file">` + URL `EvidenceAddForm` style with the drag-drop surface.
 *
 * Self-contained: it owns the upload lifecycle (FileDropzone) and, when a
 * `listEndpoint` is supplied, fetches + renders the attached-evidence list so
 * the panel reflects uploads immediately. Pass `onUploaded` to also refresh a
 * list the consumer owns (e.g. the risk detail `<EvidenceSubTable>`).
 */
import { useCallback, useEffect, useState } from 'react';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { Button } from '@/components/ui/button';
import { Download, ArrowUpRight } from '@/components/ui/icons/nucleo';
import { uploadWithProgress } from '@/lib/upload/upload-with-progress';

// Mirrors the evidence upload modal's accept list + hint copy so every
// evidence surface advertises the same supported types + size cap.
const EVIDENCE_ACCEPT =
    '.pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip';
const EVIDENCE_HINT = 'PDF, Office, CSV, image, JSON, or ZIP — up to 25 MB per file';
const MAX_FILE_MB = 25;

interface AttachedItem {
    id: string;
    title?: string | null;
    fileName?: string | null;
    name?: string | null;
    url?: string | null;
    kind?: string | null;
    /** FileRecord id for FILE evidence — drives the signed-URL download. */
    fileRecordId?: string | null;
}

export interface EvidenceUploadSectionProps {
    tenantSlug: string;
    /** Which entity field the upload POST tags the evidence with. */
    linkField: 'controlId' | 'taskId' | 'riskId' | 'assetId';
    linkId: string;
    canWrite: boolean;
    /**
     * Optional tenant-scoped GET (no `/api/t/<slug>` prefix) returning
     * `{ links?, evidence? }`. When set, the section renders the attached
     * list below the dropzone and refreshes it after each upload.
     */
    listEndpoint?: string;
    /** Called after a batch of uploads settles (e.g. to refetch a parent list). */
    onUploaded?: () => void;
    /** Field label above the dropzone. Default "Files". */
    label?: string;
    /**
     * Optional URL-link affordance shown beneath the dropzone. Tenant-scoped
     * POST path (no `/api/t/<slug>` prefix) that links a URL as evidence —
     * e.g. `/controls/<id>/evidence` or `/risks/<id>/evidence/attached`.
     */
    urlLinkEndpoint?: string;
    /**
     * Builds the POST body for a URL link. Defaults to `{ url, note }`; the
     * control evidence route wants `{ kind: 'LINK', url, note }`.
     */
    urlLinkBody?: (url: string, note: string) => Record<string, unknown>;
    /**
     * Compact dropzone — a much shorter drop area for dense side-rail
     * panels (e.g. the Controls right-rail). Forwarded to FileDropzone.
     */
    compactDropzone?: boolean;
}

export function EvidenceUploadSection({
    tenantSlug,
    linkField,
    linkId,
    canWrite,
    listEndpoint,
    onUploaded,
    label = 'Files',
    urlLinkEndpoint,
    urlLinkBody,
    compactDropzone = false,
}: EvidenceUploadSectionProps) {
    const [items, setItems] = useState<AttachedItem[] | null>(null);
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [linking, setLinking] = useState(false);
    const [linkError, setLinkError] = useState('');

    const refetch = useCallback(async () => {
        if (!listEndpoint) return;
        try {
            const res = await fetch(`/api/t/${tenantSlug}${listEndpoint}`);
            if (!res.ok) return;
            const data = await res.json();
            setItems([...(data.evidence ?? []), ...(data.links ?? [])]);
        } catch {
            /* non-fatal — the dropzone still works */
        }
    }, [tenantSlug, listEndpoint]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    const handleUpload = useCallback(
        async (
            file: File,
            ctx: { onProgress: (percent: number | null) => void; signal: AbortSignal },
        ) => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append(linkField, linkId);
            await uploadWithProgress(`/api/t/${tenantSlug}/evidence/uploads`, fd, {
                onProgress: (p) => ctx.onProgress(p.percent),
                signal: ctx.signal,
            });
        },
        [tenantSlug, linkField, linkId],
    );

    const onAllSettled = useCallback(() => {
        void refetch();
        onUploaded?.();
    }, [refetch, onUploaded]);

    const linkUrl = useCallback(async () => {
        const trimmed = url.trim();
        if (!trimmed || !urlLinkEndpoint) return;
        setLinking(true);
        setLinkError('');
        try {
            const body = urlLinkBody
                ? urlLinkBody(trimmed, note)
                : { url: trimmed, note: note.trim() || undefined };
            const res = await fetch(`/api/t/${tenantSlug}${urlLinkEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || 'Failed to link evidence');
            }
            setUrl('');
            setNote('');
            void refetch();
            onUploaded?.();
        } catch (e) {
            setLinkError(e instanceof Error ? e.message : 'Failed to link evidence');
        } finally {
            setLinking(false);
        }
    }, [url, note, urlLinkEndpoint, urlLinkBody, tenantSlug, refetch, onUploaded]);

    return (
        <div className="space-y-default" data-testid="evidence-upload-section">
            {canWrite && (
                <div>
                    <label className="mb-1 block text-xs font-medium text-content-muted">
                        {label}
                    </label>
                    <FileDropzone
                        accept={EVIDENCE_ACCEPT}
                        maxFileSizeMB={MAX_FILE_MB}
                        multiple
                        compact={compactDropzone}
                        hint={EVIDENCE_HINT}
                        onUpload={handleUpload}
                        onAllSettled={onAllSettled}
                        data-testid="evidence-upload-dropzone"
                    />
                </div>
            )}
            {canWrite && urlLinkEndpoint && (
                <div
                    className="space-y-tight border-t border-border-subtle pt-default"
                    data-testid="evidence-link-url-form"
                >
                    <label className="block text-xs font-medium text-content-muted">
                        …or link a URL
                    </label>
                    <input
                        type="url"
                        className="input w-full"
                        placeholder="https://…"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        data-testid="evidence-link-url"
                    />
                    <input
                        type="text"
                        className="input w-full"
                        placeholder="Note (optional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    {linkError && (
                        <p className="text-xs text-content-error">{linkError}</p>
                    )}
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void linkUrl()}
                        disabled={!url.trim() || linking}
                        data-testid="evidence-link-url-submit"
                        text={linking ? 'Linking…' : 'Link URL'}
                    />
                </div>
            )}
            {listEndpoint && items && items.length > 0 && (
                <ul className="space-y-tight" data-testid="evidence-attached-list">
                    {items.map((it) => {
                        const name =
                            it.title || it.fileName || it.name || it.url || 'Evidence';
                        // FILE evidence → signed-URL download (GET redirects/
                        // streams). LINK evidence → open the external URL.
                        const href = it.fileRecordId
                            ? `/api/t/${tenantSlug}/evidence/files/${it.fileRecordId}/download`
                            : it.url || null;
                        const isFile = Boolean(it.fileRecordId);
                        return (
                            <li
                                key={it.id}
                                className="flex items-center gap-tight rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-xs text-content-default"
                            >
                                {href ? (
                                    <a
                                        href={href}
                                        {...(isFile
                                            ? { download: it.fileName || it.title || undefined }
                                            : { target: '_blank', rel: 'noopener noreferrer' })}
                                        className="flex flex-1 items-center gap-tight truncate text-content-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-default)] rounded-sm"
                                        title={isFile ? `Download ${name}` : `Open ${name}`}
                                        data-testid="evidence-attached-link"
                                    >
                                        {isFile ? (
                                            <Download aria-hidden className="size-3.5 shrink-0" />
                                        ) : (
                                            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                                        )}
                                        <span className="truncate">{name}</span>
                                    </a>
                                ) : (
                                    <span className="truncate" title={name}>
                                        {name}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
