'use client';

/**
 * Security Testing list — DevSecOps scanner findings ingested via SARIF.
 *
 * Sibling of the Vulnerabilities page in the same external-security-signal
 * subsystem: reads SSR-fetched findings, filters client-side by source /
 * severity / status, and surfaces the CWE → OWASP/SSDF cross-walk. Built on
 * the shared EntityListPage + FilterToolbar + DataTable primitives.
 *
 * Read-only v1 — findings auto-materialise into the Findings register (the
 * triage surface) on ingest; per-row triage status edits are a follow-up.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from '@/components/ui/icons/nucleo/shield-alert';
import { CloudUpload } from '@/components/ui/icons/nucleo/cloud-upload';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { FilterProvider, useFilterContext, useFilters } from '@/components/ui/filter';
import { createColumns } from '@/components/ui/table';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/hooks';
import {
    buildScannerFilters,
    SCANNER_FILTER_KEYS,
    buildScannerSourceLabels,
    buildScannerStatusLabels,
} from './filter-defs';

export interface ScannerFindingRow {
    id: string;
    fingerprint: string;
    ruleId: string;
    severity: string;
    title: string;
    description: string | null;
    location: string | null;
    cweIds: string[];
    status: string;
    scannerRun: { source: string; scanType: string; ranAt: string } | null;
    frameworks: { owasp: string[]; ssdf: string[] };
}

export interface ScannerRunRow {
    id: string;
    source: string;
    scanType: string;
    ranAt: string;
    outcome: string;
    repoRef: string | null;
    findingCount: number;
    ingestedVia: string;
}

interface Props {
    initialFindings: ScannerFindingRow[];
    runs: ScannerRunRow[];
    tenantSlug: string;
    canWrite: boolean;
}

const SEVERITY_VARIANT: Record<string, StatusBadgeVariant> = {
    CRITICAL: 'error',
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'info',
};

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    OPEN: 'error',
    TRIAGED: 'warning',
    FIXED: 'success',
    FALSE_POSITIVE: 'neutral',
    ACCEPTED: 'neutral',
};

export function SecurityTestingClient(props: Props) {
    const tx = useTranslations('securityTesting');
    const tGroup = useTranslations('common.filterGroups');
    const filters = useMemo(
        () =>
            buildScannerFilters(
                (k, v) => tx(k as Parameters<typeof tx>[0], v as Parameters<typeof tx>[1]),
                (k) => tGroup(k as Parameters<typeof tGroup>[0]),
            ),
        [tx, tGroup],
    );
    const filterCtx = useFilterContext(filters, [...SCANNER_FILTER_KEYS]);
    return (
        <FilterProvider value={filterCtx}>
            <SecurityTestingInner {...props} />
        </FilterProvider>
    );
}

function SecurityTestingInner({ initialFindings, runs, tenantSlug, canWrite }: Props) {
    const t = useTranslations('securityTesting');
    const tGroup = useTranslations('common.filterGroups');
    const router = useRouter();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // ─── SARIF scan upload — read + parse client-side, POST to the ingest
    //     route, then refresh the SSR list with the newly-materialised rows. ──
    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Reset the input so re-selecting the same file re-fires onChange.
        event.target.value = '';
        if (!file) return;

        let sarif: unknown;
        try {
            sarif = JSON.parse(await file.text());
        } catch {
            toast.error(t('uploadParseError'));
            return;
        }

        setUploading(true);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/security-testing/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sarif, ingestedVia: 'UPLOAD' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = (await res.json()) as { findingsIngested?: number };
            toast.success(t('uploadSuccess', { count: result.findingsIngested ?? 0 }));
            router.refresh();
        } catch {
            toast.error(t('uploadError'));
        } finally {
            setUploading(false);
        }
    };

    const uploadAction = canWrite ? (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".sarif,.json"
                className="hidden"
                onChange={handleFileSelected}
                aria-hidden="true"
                tabIndex={-1}
            />
            <Button
                variant="secondary"
                icon={<CloudUpload />}
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
            >
                {t('uploadScan')}
            </Button>
        </>
    ) : undefined;
    const tAdapt = (k: string, v?: Record<string, unknown>) =>
        t(k as Parameters<typeof t>[0], v as Parameters<typeof t>[1]);
    const sourceLabels = useMemo(() => buildScannerSourceLabels(tAdapt), [t]);
    const statusLabels = useMemo(() => buildScannerStatusLabels(tAdapt), [t]);
    const filterDefs = useMemo(
        () => buildScannerFilters(tAdapt, (k) => tGroup(k as Parameters<typeof tGroup>[0])),
        [t, tGroup],
    );
    const { state, hasActive } = useFilters();

    const rows = useMemo(() => {
        const sources = (state.source ?? []) as string[];
        const severities = (state.severity ?? []) as string[];
        const statuses = (state.status ?? []) as string[];
        return initialFindings.filter((r) => {
            if (sources.length && !sources.includes(r.scannerRun?.source ?? '')) return false;
            if (severities.length && !severities.includes(r.severity)) return false;
            if (statuses.length && !statuses.includes(r.status)) return false;
            return true;
        });
    }, [initialFindings, state.source, state.severity, state.status]);

    const openCritical = useMemo(
        () => initialFindings.filter((r) => r.severity === 'CRITICAL' && r.status === 'OPEN').length,
        [initialFindings],
    );

    const columns = useMemo(
        () =>
            createColumns<ScannerFindingRow>([
                {
                    id: 'severity',
                    header: t('colSeverity'),
                    accessorFn: (r) => r.severity,
                    cell: ({ row }) => (
                        <StatusBadge variant={SEVERITY_VARIANT[row.original.severity] ?? 'neutral'}>
                            {row.original.severity}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'title',
                    header: t('colFinding'),
                    accessorFn: (r) => r.title,
                    cell: ({ row }) => (
                        <div className="min-w-0" data-testid={`scanner-finding-${row.original.id}`}>
                            <div className="truncate font-medium text-content-default">{row.original.title}</div>
                            <code className="text-xs text-content-subtle font-mono">{row.original.ruleId}</code>
                        </div>
                    ),
                },
                {
                    id: 'source',
                    header: t('colSource'),
                    accessorFn: (r) => r.scannerRun?.source ?? '',
                    cell: ({ row }) => {
                        const src = row.original.scannerRun?.source;
                        if (!src) return <span className="text-content-muted">—</span>;
                        return (
                            <span className="text-content-muted">
                                {sourceLabels[src] ?? src}
                                <span className="text-content-subtle"> · {row.original.scannerRun?.scanType}</span>
                            </span>
                        );
                    },
                },
                {
                    id: 'location',
                    header: t('colLocation'),
                    accessorFn: (r) => r.location ?? '',
                    cell: ({ row }) =>
                        row.original.location ? (
                            <code className="text-xs text-content-muted font-mono">{row.original.location}</code>
                        ) : (
                            <span className="text-content-muted">—</span>
                        ),
                },
                {
                    id: 'frameworks',
                    header: t('colMapsTo'),
                    accessorFn: (r) => r.frameworks.owasp.join(',') + r.frameworks.ssdf.join(','),
                    enableSorting: false,
                    cell: ({ row }) => {
                        const { owasp, ssdf } = row.original.frameworks;
                        if (!owasp.length && !ssdf.length) return <span className="text-content-muted">—</span>;
                        return (
                            <div className="flex flex-wrap gap-tight">
                                {owasp.map((o) => (
                                    <span key={o} className="text-xs text-content-muted">
                                        {o.split('-')[0]}
                                    </span>
                                ))}
                                {ssdf.map((s) => (
                                    <span key={s} className="text-xs text-content-subtle">
                                        SSDF {s}
                                    </span>
                                ))}
                            </div>
                        );
                    },
                },
                {
                    id: 'status',
                    header: t('colStatus'),
                    accessorFn: (r) => r.status,
                    cell: ({ row }) => (
                        <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
                            {statusLabels[row.original.status] ?? row.original.status}
                        </StatusBadge>
                    ),
                },
            ]),
        [t],
    );

    const description =
        runs.length === 0
            ? t('descEmpty')
            : t('descActive', { runs: runs.length, critical: openCritical });

    return (
        <EntityListPage<ScannerFindingRow>
            header={{
                // Reached from the Internal Audit "Scans" link, not the
                // sidebar. Smart back resolves "Back to Internal Audit".
                back: { smart: true },
                title: (
                    <>
                        <ShieldAlert className="inline-block mr-2 h-5 w-5 align-text-bottom" />
                        {t('title')}
                    </>
                ),
                description,
                actions: uploadAction,
            }}
            filters={{ defs: filterDefs }}
            table={{
                data: rows,
                columns,
                getRowId: (r) => r.id,
                resourceName: (plural) => (plural ? t('resourceFindings') : t('resourceFinding')),
                emptyState: (
                    <EmptyState
                        icon={ShieldAlert}
                        title={hasActive ? t('emptyMatchTitle') : t('emptyTitle')}
                        description={
                            hasActive
                                ? t('emptyMatchDesc')
                                : t('emptyDesc', { slug: tenantSlug })
                        }
                    />
                ),
            }}
        />
    );
}
