'use client';

/**
 * B5 — Evidence detail sheet.
 *
 * Pre-B5 the evidence table had no way to drill into a single
 * record — every action (Submit, Approve, Reject) was inline on the
 * row, and the underlying detail fields (description, owner,
 * retention, related control) were invisible from the list.
 *
 * This sheet opens on row click. It shows the read-only evidence
 * detail + the existing approval-flow buttons (which call back to
 * the parent's `onReview` to keep the existing optimistic-update
 * mutation pipeline intact) + an "Edit" button that delegates to
 * the parent to mount the EditEvidenceModal.
 *
 * Mirrors the `<ControlDetailSheet>` shape so the surface reads as
 * a sibling of the established controls drill-down.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { RejectReasonModal } from './RejectReasonModal';
import { evidenceStatusLabel, evidenceTypeLabel, evidenceReviewActionLabel } from './evidence-labels';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { CopyText } from '@/components/ui/copy-text';
import {
    FileTypeIcon,
    resolveFileTypeIcon,
} from '@/components/ui/file-type-icon';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { Pen2, Download } from '@/components/ui/icons/nucleo';
import Link from 'next/link';
import { textLinkVariants } from '@/components/ui/typography';
import { useTenantHref, useTenantApiUrl } from '@/lib/tenant-context-provider';

/** Human-readable byte size (mirrors FileDropzone's local helper). */
function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

const EVIDENCE_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    DRAFT: 'neutral',
    SUBMITTED: 'info',
    APPROVED: 'success',
    REJECTED: 'error',
    NEEDS_REVIEW: 'warning',
};

export interface EvidenceDetailSheetProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    /** The clicked row id; `null` while the sheet is closed. */
    evidenceId: string | null;
    /** Allowed write surfaces — gates the edit + review buttons. */
    canWrite: boolean;
    canAdmin: boolean;
    /** Open the edit modal for the loaded evidence. */
    onEdit: (evidence: {
        id: string;
        title: string;
        description: string | null;
        ownerUserId: string | null;
        controlId: string | null;
        /** B8 follow-up — current folder, threaded to the edit modal. */
        folder: string | null;
        /** Retention date (ISO) — edited in the modal now. */
        retentionUntil: string | null;
    }) => void;
    /**
     * Existing parent review pipeline — re-uses the optimistic mutation.
     * `comment` carries a rejection reason (required for REJECTED, threaded
     * from the reject-reason modal); omitted for SUBMITTED / APPROVED.
     */
    onReview: (id: string, action: 'SUBMITTED' | 'APPROVED' | 'REJECTED', comment?: string) => void;
}

/** Linked FileRecord metadata (EP-2 — powers preview + metadata block). */
interface EvidenceFileRecord {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    retentionUntil: string | null;
}

/** One EvidenceReview row for the history timeline. */
interface EvidenceReviewRow {
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
    reviewer?: { name: string | null; email: string | null } | null;
}

interface EvidenceDetailPayload {
    id: string;
    title: string;
    description: string | null;
    content: string | null;
    type: string;
    status: string;
    fileName: string | null;
    fileSize: number | null;
    fileRecordId: string | null;
    nextReviewDate: string | null;
    retentionUntil: string | null;
    expiredAt: string | null;
    reviewCycle: string | null;
    owner: string | null;
    ownerUserId: string | null;
    controlId: string | null;
    control?: { id: string; code: string | null; name: string } | null;
    taskId: string | null;
    /** Source task / risk / asset — set when uploaded from that entity. */
    task?: { id: string; key: string | null; title: string } | null;
    riskId: string | null;
    risk?: { id: string; key: string | null; title: string } | null;
    assetId: string | null;
    asset?: { id: string; key: string | null; name: string } | null;
    createdAt: string;
    updatedAt: string;
    /** EP-2 — linked file metadata (name/size/MIME/SHA-256 + retention). */
    fileRecord?: EvidenceFileRecord | null;
    /** EP-2 — review-history rows (newest first), reviewer name/email joined. */
    reviews?: EvidenceReviewRow[];
    /** SP-3 — present when imported from SharePoint. */
    sharePoint?: { sourceUrl: string; lastSyncedAt: string | null; syncStatus: string } | null;
}

export function EvidenceDetailSheet({
    open,
    setOpen,
    evidenceId,
    canWrite,
    canAdmin,
    onEdit,
    onReview,
}: EvidenceDetailSheetProps) {
    const t = useTranslations('evidence');
    const tenantHref = useTenantHref();
    const tenantApiUrl = useTenantApiUrl();
    // ep1 review gate — required-reason prompt for the sheet's Reject.
    const [rejectOpen, setRejectOpen] = useState(false);

    const detailQuery = useTenantSWR<EvidenceDetailPayload>(
        open && evidenceId ? CACHE_KEYS.evidence.detail(evidenceId) : null,
    );

    const evidence = detailQuery.data;

    const metaRows = useMemo(() => {
        if (!evidence) return [];
        const rows: Array<{ label: string; value: React.ReactNode }> = [];
        rows.push({ label: t('detail.metaType'), value: evidenceTypeLabel(evidence.type, t) });
        if (evidence.owner) rows.push({ label: t('detail.metaOwner'), value: evidence.owner });
        if (evidence.control) {
            rows.push({
                label: t('detail.metaControl'),
                value: `${evidence.control.code ?? ''}${evidence.control.code ? ' — ' : ''}${evidence.control.name}`,
            });
        }
        if (evidence.task) {
            // Back-reference — which task this evidence was uploaded from.
            rows.push({
                label: t('detail.fromTask'),
                value: (
                    <Link
                        href={tenantHref(`/tasks/${evidence.task.id}`)}
                        className={textLinkVariants({ tone: 'link' })}
                    >
                        {evidence.task.key ? `${evidence.task.key} — ` : ''}
                        {evidence.task.title}
                    </Link>
                ),
            });
        }
        if (evidence.risk) {
            rows.push({
                label: t('detail.fromRisk'),
                value: (
                    <Link
                        href={tenantHref(`/risks/${evidence.risk.id}`)}
                        className={textLinkVariants({ tone: 'link' })}
                    >
                        {evidence.risk.key ? `${evidence.risk.key} — ` : ''}
                        {evidence.risk.title}
                    </Link>
                ),
            });
        }
        if (evidence.asset) {
            rows.push({
                label: t('detail.fromAsset'),
                value: (
                    <Link
                        href={tenantHref(`/assets/${evidence.asset.id}`)}
                        className={textLinkVariants({ tone: 'link' })}
                    >
                        {evidence.asset.key ? `${evidence.asset.key} — ` : ''}
                        {evidence.asset.name}
                    </Link>
                ),
            });
        }
        if (evidence.nextReviewDate) {
            rows.push({
                label: t('detail.nextReview'),
                value: formatDate(new Date(evidence.nextReviewDate)),
            });
        }
        rows.push({
            label: t('detail.updated'),
            value: formatDate(new Date(evidence.updatedAt)),
        });
        if (evidence.sharePoint?.sourceUrl) {
            rows.push({
                label: t('detail.source'),
                value: (
                    <a
                        href={evidence.sharePoint.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-content-link"
                    >
                        {t('detail.viewInSharePoint')}
                    </a>
                ),
            });
        }
        return rows;
    }, [evidence, tenantHref, t]);

    return (
        <Sheet
            open={open}
            onOpenChange={setOpen}
            size="md"
            title={evidence?.title ?? t('detail.sheetTitle')}
        >
            {detailQuery.isLoading || !evidence ? (
                <>
                    <Sheet.Header title={t('detail.loadingTitle')} />
                    <Sheet.Body>
                        <div className="flex h-40 items-center justify-center text-sm text-content-muted">
                            {t('detail.loadingBody')}
                        </div>
                    </Sheet.Body>
                </>
            ) : detailQuery.error ? (
                <>
                    <Sheet.Header title={t('detail.errorTitle')} />
                    <Sheet.Body>
                        <div
                            className="rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            role="alert"
                            data-testid="evidence-sheet-error"
                        >
                            {detailQuery.error instanceof Error
                                ? detailQuery.error.message
                                : t('detail.loadFailed')}
                        </div>
                    </Sheet.Body>
                </>
            ) : (
                <>
                    <Sheet.Header
                        title={evidence.title}
                        description={evidence.description || undefined}
                    />
                    <Sheet.Body>
                        <div className="space-y-default">
                            <div className="flex items-center gap-tight">
                                <StatusBadge
                                    variant={
                                        EVIDENCE_STATUS_VARIANT[evidence.status] ??
                                        'neutral'
                                    }
                                    id="evidence-sheet-status"
                                >
                                    {evidenceStatusLabel(evidence.status, t)}
                                </StatusBadge>
                            </div>

                            {/* EP-2 — inline file preview (image / PDF /
                                icon fallback), reusing the shared file-type
                                resolver. Uses the existing tenant-scoped
                                download route as the source URL. */}
                            <EvidenceFilePreview
                                evidence={evidence}
                                fileUrl={
                                    evidence.fileRecordId
                                        ? tenantApiUrl(
                                              `/evidence/files/${evidence.fileRecordId}/download`,
                                          )
                                        : null
                                }
                                t={t}
                            />

                            {/* EP-2 — unconditional download affordance for
                                file-backed evidence (not gated behind review
                                status). */}
                            {evidence.fileRecordId && (
                                <a
                                    href={tenantApiUrl(
                                        `/evidence/files/${evidence.fileRecordId}/download`,
                                    )}
                                    download
                                    className="inline-flex items-center gap-tight rounded-md border border-border-default bg-bg-default px-3 py-1.5 text-sm font-medium text-content-emphasis transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    id="evidence-sheet-download-btn"
                                >
                                    <Download className="size-4" />
                                    {t('detail.download')}
                                </a>
                            )}

                            {metaRows.length > 0 && (
                                <dl className="grid grid-cols-1 gap-1">
                                    {metaRows.map((row) => (
                                        <div
                                            key={row.label}
                                            className="flex items-baseline justify-between gap-default text-sm"
                                        >
                                            <dt className="text-content-muted">
                                                {row.label}
                                            </dt>
                                            <dd className="text-content-default text-right">
                                                {row.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}

                            {evidence.description && (
                                <div className="space-y-tight">
                                    <p className="text-xs font-medium uppercase tracking-widest text-content-subtle">
                                        {t('detail.descriptionLabel')}
                                    </p>
                                    <p className="text-sm text-content-default whitespace-pre-wrap">
                                        {evidence.description}
                                    </p>
                                </div>
                            )}

                            {/* EP-2 — file metadata block (filename, size,
                                MIME, SHA-256, retention/expiry, next review). */}
                            <EvidenceFileMetadata evidence={evidence} t={t} />

                            {/* EP-2 — review-history timeline. Rows are
                                written on every transition but were invisible
                                until now. */}
                            <EvidenceReviewTimeline
                                reviews={evidence.reviews ?? []}
                                t={t}
                            />
                        </div>
                    </Sheet.Body>
                    <Sheet.Footer>
                        <div className="flex flex-wrap items-center gap-tight">
                            {canWrite && (
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={() =>
                                        onEdit({
                                            id: evidence.id,
                                            title: evidence.title,
                                            description: evidence.description,
                                            ownerUserId: evidence.ownerUserId,
                                            controlId: evidence.controlId,
                                            // B8 follow-up — the
                                            // detail sheet fetches a
                                            // fresh evidence row;
                                            // forward its current
                                            // folder so the edit
                                            // modal opens already
                                            // populated.
                                            folder: (
                                                evidence as {
                                                    folder?: string | null;
                                                }
                                            ).folder ?? null,
                                            retentionUntil: evidence.retentionUntil,
                                        })
                                    }
                                    id="evidence-sheet-edit-btn"
                                    aria-label={t('detail.editAria')}
                                >
                                    <Pen2 className="size-4" />
                                </Button>
                            )}
                            {/* Approval flow — existing parent mutation
                                runs the optimistic update + audit
                                emission; the sheet just routes the
                                button click back to the parent.

                                B5 primary-action discipline + modal
                                action-order rule:
                                  - Author-side corrections (Submit /
                                    Re-submit / Re-certify) render as
                                    `secondary`. They're rendered
                                    FIRST so the affirmative action
                                    on the SUBMITTED branch ends the
                                    JSX last.
                                  - Reviewer's destructive Reject
                                    sits before the approving CTA so
                                    the LAST button on every visible
                                    branch is the most-affirmative
                                    action (matches the modal-
                                    action-order rule). */}
                            {canWrite && evidence.status === 'DRAFT' && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onReview(evidence.id, 'SUBMITTED')}
                                    id="evidence-sheet-submit-btn"
                                >
                                    {t('detail.submitForReview')}
                                </Button>
                            )}
                            {canWrite && evidence.status === 'REJECTED' && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onReview(evidence.id, 'SUBMITTED')}
                                    id="evidence-sheet-resubmit-btn"
                                >
                                    {t('detail.resubmit')}
                                </Button>
                            )}
                            {canWrite && evidence.status === 'NEEDS_REVIEW' && (
                                // EP-2 Part 5 — first-class "Re-review"
                                // affordance (distinct label from the generic
                                // Submit). Functionally NEEDS_REVIEW →
                                // SUBMITTED, but named for renewal so it's
                                // discoverable.
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onReview(evidence.id, 'SUBMITTED')}
                                    id="evidence-sheet-rereview-btn"
                                >
                                    {t('detail.reReview')}
                                </Button>
                            )}
                            {canAdmin && evidence.status === 'SUBMITTED' && (
                                <>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setRejectOpen(true)}
                                        id="evidence-sheet-reject-btn"
                                    >
                                        {t('detail.reject')}
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => onReview(evidence.id, 'APPROVED')}
                                        id="evidence-sheet-approve-btn"
                                    >
                                        {t('detail.approve')}
                                    </Button>
                                </>
                            )}
                        </div>
                    </Sheet.Footer>
                    <RejectReasonModal
                        open={rejectOpen}
                        onClose={() => setRejectOpen(false)}
                        onConfirm={(reason) => onReview(evidence.id, 'REJECTED', reason)}
                    />
                </>
            )}
        </Sheet>
    );
}

// ─── EP-2 sub-components ─────────────────────────────────────────────

type Tx = (key: string, values?: Record<string, string | number>) => string;

/**
 * Inline file preview: image thumbnail for image MIME types, a PDF
 * embed where the browser supports it, or a file-type-icon fallback
 * otherwise. Renders nothing for non-file evidence (no fileRecordId).
 */
function EvidenceFilePreview({
    evidence,
    fileUrl,
    t,
}: {
    evidence: EvidenceDetailPayload;
    fileUrl: string | null;
    t: Tx;
}) {
    if (!evidence.fileRecordId || !fileUrl) return null;
    const fileName = evidence.fileRecord?.originalName ?? evidence.fileName ?? null;
    const mime = evidence.fileRecord?.mimeType ?? null;
    const match = resolveFileTypeIcon(fileName, mime, evidence.type);
    const isImage = match.label === 'Image';
    const isPdf = match.label === 'PDF';

    return (
        <div
            className="overflow-hidden rounded-lg border border-border-default bg-bg-muted"
            data-testid="evidence-sheet-preview"
        >
            {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- runtime tenant-scoped /api download URL with auth cookies; next/image needs a remote-pattern allowlist + known dimensions, neither of which fits a per-tenant evidence thumbnail.
                <img
                    src={fileUrl}
                    alt={evidence.title}
                    loading="lazy"
                    decoding="async"
                    className="max-h-80 w-full object-contain"
                    data-testid="evidence-sheet-preview-image"
                />
            ) : isPdf ? (
                <object
                    data={fileUrl}
                    type="application/pdf"
                    className="h-80 w-full"
                    aria-label={evidence.title}
                    data-testid="evidence-sheet-preview-pdf"
                >
                    {/* Graceful fallback where inline PDF embedding is
                        unsupported — the download link below still works. */}
                    <div className="flex h-full flex-col items-center justify-center gap-tight p-6 text-center text-sm text-content-muted">
                        <FileTypeIcon fileName="x.pdf" size={48} />
                        {t('detail.previewUnavailable')}
                    </div>
                </object>
            ) : (
                <div
                    className="flex flex-col items-center justify-center gap-tight p-6 text-center text-sm text-content-muted"
                    data-testid="evidence-sheet-preview-fallback"
                >
                    <FileTypeIcon
                        fileName={fileName}
                        mime={mime}
                        domainKind={evidence.type}
                        size={48}
                    />
                    {t('detail.previewUnavailable')}
                </div>
            )}
        </div>
    );
}

/**
 * File-metadata block: filename, size, MIME, SHA-256 (copyable),
 * retention/expiry, and next review date. Sourced from the linked
 * FileRecord + the evidence row itself. Renders nothing when there is
 * no file and no schedule metadata to show.
 */
function EvidenceFileMetadata({
    evidence,
    t,
}: {
    evidence: EvidenceDetailPayload;
    t: Tx;
}) {
    const fr = evidence.fileRecord ?? null;
    const rows: Array<{ label: string; value: React.ReactNode }> = [];

    if (fr) {
        rows.push({ label: t('detail.fileName'), value: fr.originalName });
        rows.push({ label: t('detail.fileSize'), value: formatBytes(fr.sizeBytes) });
        rows.push({ label: t('detail.fileMime'), value: fr.mimeType });
        rows.push({
            label: t('detail.fileHash'),
            value: (
                <CopyText
                    value={fr.sha256}
                    label={t('detail.copyHash')}
                    truncate
                    className="max-w-[16rem] font-mono text-xs"
                >
                    {fr.sha256}
                </CopyText>
            ),
        });
    }
    const retention = evidence.retentionUntil ?? fr?.retentionUntil ?? null;
    if (retention) {
        rows.push({
            label: t('detail.retentionUntil'),
            value: formatDate(new Date(retention)),
        });
    }
    if (evidence.expiredAt) {
        rows.push({
            label: t('detail.expiry'),
            value: formatDate(new Date(evidence.expiredAt)),
        });
    }
    if (evidence.nextReviewDate) {
        rows.push({
            label: t('detail.nextReview'),
            value: formatDate(new Date(evidence.nextReviewDate)),
        });
    }

    if (rows.length === 0) return null;

    return (
        <div className="space-y-tight" data-testid="evidence-sheet-file-meta">
            <p className="text-xs font-medium uppercase tracking-widest text-content-subtle">
                {t('detail.fileMetaTitle')}
            </p>
            <dl className="grid grid-cols-1 gap-1">
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-default text-sm"
                    >
                        <dt className="text-content-muted">{row.label}</dt>
                        <dd className="text-content-default text-right">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

/**
 * Review-history timeline: renders the EvidenceReview rows (reviewer,
 * action, comment, timestamp) as a simple vertical timeline. Action
 * labels are localized via the shared status-label group.
 */
function EvidenceReviewTimeline({
    reviews,
    t,
}: {
    reviews: EvidenceReviewRow[];
    t: Tx;
}) {
    return (
        <div className="space-y-tight" data-testid="evidence-sheet-review-history">
            <p className="text-xs font-medium uppercase tracking-widest text-content-subtle">
                {t('detail.reviewHistoryTitle')}
            </p>
            {reviews.length === 0 ? (
                <p className="text-sm text-content-muted">
                    {t('detail.noReviewHistory')}
                </p>
            ) : (
                <ol className="space-y-default">
                    {reviews.map((r) => {
                        const who =
                            r.reviewer?.name ||
                            r.reviewer?.email ||
                            t('detail.reviewerUnknown');
                        return (
                            <li
                                key={r.id}
                                className="flex gap-tight"
                                data-testid={`evidence-review-${r.id}`}
                            >
                                <span
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-content-subtle"
                                    aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-tight">
                                        <span className="text-sm font-medium text-content-emphasis">
                                            {evidenceReviewActionLabel(r.action, t)}
                                        </span>
                                        <span className="text-xs text-content-muted">
                                            {who}
                                        </span>
                                        <span className="text-xs text-content-subtle">
                                            {formatDateTime(new Date(r.createdAt))}
                                        </span>
                                    </div>
                                    {r.comment && (
                                        <p className="mt-0.5 text-sm text-content-default whitespace-pre-wrap">
                                            {r.comment}
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
