'use client';

/**
 * Control detail — Evidence sub-table (R10-PR3 follow-up).
 *
 * Extracted from `page.tsx` as part of the raw-`<table>` → `<DataTable>`
 * migration; the page-size ratchet at
 * `tests/guards/controls-detail-page-size.test.ts` mandates that
 * inline-grown helpers live under `_tabs/` rather than balloon the
 * 1,400+ line page.
 *
 * The evidence tab interleaves two source arrays:
 *   • `links` — EvidenceLinkDTO rows (user-attached URLs / file refs)
 *   • `directEvidence` — Evidence entities attached straight to the
 *     control, deduped against the `links` set by `fileRecordId`.
 *
 * Pre-migration both were rendered into one raw `<table>` with two
 * `.map()` passes. The unified row shape below preserves the rendering
 * 1:1 (StatusBadge variants, "Title/URL" cell handling for both link
 * + evidence rows, Actions column gated by canWrite) while the
 * DataTable primitive supplies hover surface, circular row-select,
 * skeleton/empty-state chrome, and the future column-visibility gear.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { DataTable, createColumns } from '@/components/ui/table';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { textLinkVariants } from '@/components/ui/typography';
import { formatDate } from '@/lib/format-date';
import type { EvidenceLinkDTO } from '@/lib/dto';

export interface EvidenceTabData {
    links: EvidenceLinkDTO[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: any[];
}

interface EvidenceTableRow {
    rowKey: string;
    kindBadge: { label: string; variant: StatusBadgeVariant };
    titleCell: 'link-href' | 'evidence-title';
    titleHref?: string;
    titleNote?: string;
    titleText?: string;
    statusCell: 'createdBy' | 'badge';
    createdByName?: string;
    statusBadge?: { label: string; variant: StatusBadgeVariant };
    createdAt?: string | Date | null;
    linkId?: string;           // present on rows we can unlink
}

export function EvidenceSubTable({
    data,
    loading,
    canWrite,
    onUnlink,
    tenantHref,
}: {
    data: EvidenceTabData | undefined;
    loading: boolean;
    canWrite: boolean;
    onUnlink: (linkId: string) => void;
    tenantHref: (path: string) => string;
}) {
    const rows = useMemo<EvidenceTableRow[]>(() => {
        const links = data?.links ?? [];
        const evidenceRows = data?.evidence ?? [];
        const linkedFileIds = new Set(
            links.map((l) => l.fileId).filter(Boolean) as string[],
        );
        const directEvidence = evidenceRows.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e: any) =>
                !e.fileRecordId || !linkedFileIds.has(e.fileRecordId as string),
        );

        const out: EvidenceTableRow[] = [];
        for (const el of links) {
            out.push({
                rowKey: `link-${el.id}`,
                kindBadge: {
                    label: el.kind,
                    variant: el.kind === 'FILE' ? 'success' : 'info',
                },
                titleCell: 'link-href',
                titleHref: el.url ?? undefined,
                titleNote: el.note ?? undefined,
                statusCell: 'createdBy',
                createdByName: el.createdBy?.name ?? undefined,
                createdAt: el.createdAt,
                linkId: el.id,
            });
        }
        for (const ev of directEvidence) {
            out.push({
                rowKey: `ev-${ev.id}`,
                kindBadge: {
                    label: ev.type,
                    variant:
                        ev.type === 'FILE'
                            ? 'success'
                            : ev.type === 'TEXT'
                              ? 'neutral'
                              : 'info',
                },
                titleCell: 'evidence-title',
                titleText: ev.title,
                statusCell: 'badge',
                statusBadge: {
                    label: ev.status,
                    variant:
                        ev.status === 'APPROVED'
                            ? 'success'
                            : ev.status === 'REJECTED'
                              ? 'error'
                              : ev.status === 'SUBMITTED'
                                ? 'info'
                                : 'neutral',
                },
                createdAt: ev.createdAt,
            });
        }
        return out;
    }, [data]);

    const columns = useMemo(
        () =>
            createColumns<EvidenceTableRow>([
                {
                    id: 'type',
                    header: 'Type',
                    cell: ({ row }) => (
                        <StatusBadge variant={row.original.kindBadge.variant}>
                            {row.original.kindBadge.label}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'title',
                    header: 'Title / URL',
                    cell: ({ row }) => {
                        const r = row.original;
                        if (r.titleCell === 'link-href') {
                            return (
                                <span className="text-sm">
                                    {r.titleHref ? (
                                        <a
                                            href={r.titleHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={textLinkVariants({ tone: 'link' })}
                                        >
                                            {r.titleHref}
                                        </a>
                                    ) : (
                                        r.titleNote || '—'
                                    )}
                                </span>
                            );
                        }
                        return (
                            <span className="text-sm">
                                <Link
                                    href={tenantHref(`/evidence`)}
                                    className={textLinkVariants({ tone: 'link' })}
                                >
                                    {r.titleText}
                                </Link>
                            </span>
                        );
                    },
                },
                {
                    id: 'status',
                    header: 'Status',
                    cell: ({ row }) => {
                        const r = row.original;
                        if (r.statusCell === 'createdBy') {
                            return (
                                <span className="text-xs text-content-muted">
                                    {r.createdByName || '—'}
                                </span>
                            );
                        }
                        return r.statusBadge ? (
                            <StatusBadge variant={r.statusBadge.variant}>
                                {r.statusBadge.label}
                            </StatusBadge>
                        ) : (
                            <span>—</span>
                        );
                    },
                },
                {
                    id: 'date',
                    header: 'Date',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-muted">
                            {row.original.createdAt
                                ? formatDate(row.original.createdAt)
                                : '—'}
                        </span>
                    ),
                },
                ...(canWrite
                    ? [
                          {
                              id: 'actions',
                              header: 'Actions',
                              cell: ({ row }: { row: { original: EvidenceTableRow } }) =>
                                  row.original.linkId ? (
                                      <button
                                          className="text-content-error text-xs hover:text-content-error"
                                          onClick={() => onUnlink(row.original.linkId!)}
                                          id={`unlink-${row.original.linkId}`}
                                      >
                                          × Remove
                                      </button>
                                  ) : null,
                          },
                      ]
                    : []),
            ]),
        [canWrite, onUnlink, tenantHref],
    );

    // E2E semantics — preserve the pre-migration contract:
    //
    //   • `#evidence-table` is present ONLY when rows are rendering.
    //     `toBeVisible({...})` in the E2E specs is therefore a
    //     wait-for-data signal (the helper `linkUrlEvidence` relies
    //     on this — it clicks Submit and then asserts visibility, and
    //     the next assertion immediately reads `tbody tr` row count).
    //   • The empty-state branch retains `#no-evidence` (its own
    //     distinct selector).
    //   • DataTable mounts a real `<table>` inside the wrapper, so
    //     `#evidence-table tbody tr` descent still works for
    //     row-count / row-click assertions.
    if (rows.length === 0) {
        return (
            <DataTable
                data={rows}
                columns={columns}
                getRowId={(r) => r.rowKey}
                loading={loading}
                emptyState={
                    <div id="no-evidence">
                        <InlineEmptyState
                            title="No evidence linked"
                            description="Link existing evidence or upload new files to satisfy this control."
                        />
                    </div>
                }
            />
        );
    }
    return (
        <div id="evidence-table">
            <DataTable
                data={rows}
                columns={columns}
                getRowId={(r) => r.rowKey}
                loading={loading}
            />
        </div>
    );
}
