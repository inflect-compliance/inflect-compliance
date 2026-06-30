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
import { useMemo } from 'react';
import { ShieldAlert } from '@/components/ui/icons/nucleo/shield-alert';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { FilterProvider, useFilterContext, useFilters } from '@/components/ui/filter';
import { createColumns } from '@/components/ui/table';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
    buildScannerFilters,
    SCANNER_FILTER_KEYS,
    SCANNER_SOURCE_LABELS,
    SCANNER_STATUS_LABELS,
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
    const filterCtx = useFilterContext(buildScannerFilters(), [...SCANNER_FILTER_KEYS]);
    return (
        <FilterProvider value={filterCtx}>
            <SecurityTestingInner {...props} />
        </FilterProvider>
    );
}

function SecurityTestingInner({ initialFindings, runs, tenantSlug }: Props) {
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
                    header: 'Severity',
                    accessorFn: (r) => r.severity,
                    cell: ({ row }) => (
                        <StatusBadge variant={SEVERITY_VARIANT[row.original.severity] ?? 'neutral'}>
                            {row.original.severity}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'title',
                    header: 'Finding',
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
                    header: 'Source',
                    accessorFn: (r) => r.scannerRun?.source ?? '',
                    cell: ({ row }) => {
                        const src = row.original.scannerRun?.source;
                        if (!src) return <span className="text-content-muted">—</span>;
                        return (
                            <span className="text-content-muted">
                                {SCANNER_SOURCE_LABELS[src as keyof typeof SCANNER_SOURCE_LABELS] ?? src}
                                <span className="text-content-subtle"> · {row.original.scannerRun?.scanType}</span>
                            </span>
                        );
                    },
                },
                {
                    id: 'location',
                    header: 'Location',
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
                    header: 'Maps to',
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
                    header: 'Status',
                    accessorFn: (r) => r.status,
                    cell: ({ row }) => (
                        <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
                            {SCANNER_STATUS_LABELS[row.original.status as keyof typeof SCANNER_STATUS_LABELS] ??
                                row.original.status}
                        </StatusBadge>
                    ),
                },
            ]),
        [],
    );

    const description =
        runs.length === 0
            ? 'Scanner findings ingested from your CI via SARIF.'
            : `${runs.length} recent run${runs.length === 1 ? '' : 's'} · ${openCritical} open critical finding${openCritical === 1 ? '' : 's'}.`;

    return (
        <EntityListPage<ScannerFindingRow>
            header={{
                // MAIN page (sidebar destination) — no back affordance /
                // breadcrumbs (forbidden on roots; see page-segregation.ts).
                title: (
                    <>
                        <ShieldAlert className="inline-block mr-2 h-5 w-5 align-text-bottom" />
                        Security Testing
                    </>
                ),
                description,
            }}
            filters={{ defs: buildScannerFilters() }}
            table={{
                data: rows,
                columns,
                getRowId: (r) => r.id,
                resourceName: (plural) => (plural ? 'findings' : 'finding'),
                emptyState: (
                    <EmptyState
                        icon={ShieldAlert}
                        title={hasActive ? 'No matching findings' : 'No scanner findings yet'}
                        description={
                            hasActive
                                ? 'Try clearing a filter.'
                                : `POST a SARIF report from your CI to /api/t/${tenantSlug}/security-testing/ingest. A passing scan attaches automated evidence to its mapped control; failing findings appear here and in the Findings register.`
                        }
                    />
                ),
            }}
        />
    );
}
