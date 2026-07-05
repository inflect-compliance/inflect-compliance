'use client';

/**
 * Vulnerabilities list — matched CVEs across the tenant's assets.
 *
 * Reads SSR-fetched rows, filters client-side by status / severity, and
 * exposes the compliance-graph bridge: convert a vulnerability into a Risk or
 * a Finding (explicit, opt-in) via the existing usecases. Built on the shared
 * EntityListPage + FilterToolbar + DataTable primitives.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from '@/components/ui/icons/nucleo/shield-alert';
import { ArrowUpRight } from '@/components/ui/icons/nucleo/arrow-up-right';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { FilterProvider, useFilterContext, useFilters } from '@/components/ui/filter';
import { createColumns } from '@/components/ui/table';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/hooks';
import { buildVulnFilters, VULN_FILTER_KEYS, VULN_STATUS_LABELS } from './filter-defs';

export interface VulnRow {
    id: string;
    status: string;
    matchedVia: string;
    cveId: string;
    cve: {
        id: string;
        cvssScore: number | null;
        cvssSeverity: string | null;
        summary: string;
        references: string[];
    };
    asset: { id: string; key: string | null; name: string };
}

interface Props {
    initialRows: VulnRow[];
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
    MITIGATING: 'warning',
    MITIGATED: 'success',
    ACCEPTED: 'neutral',
    FALSE_POSITIVE: 'neutral',
};

export function VulnerabilitiesClient({ initialRows, tenantSlug, canWrite }: Props) {
    const filterCtx = useFilterContext(buildVulnFilters(), [...VULN_FILTER_KEYS]);
    return (
        <FilterProvider value={filterCtx}>
            <VulnerabilitiesInner initialRows={initialRows} tenantSlug={tenantSlug} canWrite={canWrite} />
        </FilterProvider>
    );
}

function VulnerabilitiesInner({ initialRows, tenantSlug, canWrite }: Props) {
    const t = useTranslations('vulnerabilities');
    const router = useRouter();
    const toast = useToast();
    const { state, hasActive } = useFilters();
    const [pendingId, setPendingId] = useState<string | null>(null);

    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    const rows = useMemo(() => {
        const statuses = (state.status ?? []) as string[];
        const severities = (state.severity ?? []) as string[];
        return initialRows.filter((r) => {
            if (statuses.length && !statuses.includes(r.status)) return false;
            if (severities.length && !severities.includes((r.cve.cvssSeverity ?? '').toUpperCase())) return false;
            return true;
        });
    }, [initialRows, state.status, state.severity]);

    const convert = useCallback(
        async (row: VulnRow, target: 'risk' | 'finding') => {
            setPendingId(row.id);
            try {
                const res = await fetch(apiUrl(`/vulnerabilities/${row.id}/convert-to-${target}`), { method: 'POST' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                toast.success(target === 'risk' ? t('riskCreated') : t('findingCreated'));
                router.refresh();
            } catch {
                toast.error(t('convertFailed', { target }));
            } finally {
                setPendingId(null);
            }
        },
        [apiUrl, router, toast, t],
    );

    const columns = useMemo(() => createColumns<VulnRow>([
        {
            id: 'cve',
            header: t('colCve'),
            accessorFn: (r) => r.cve.id,
            cell: ({ row }) => {
                const cve = row.original.cve;
                const href = cve.references[0] ?? `https://nvd.nist.gov/vuln/detail/${cve.id}`;
                return (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`vuln-cve-${row.original.id}`}
                        className="inline-flex items-center gap-1 font-medium text-content-link hover:underline"
                    >
                        {cve.id}
                        <ArrowUpRight className="h-3 w-3 shrink-0" />
                    </a>
                );
            },
        },
        {
            id: 'asset',
            header: t('colAsset'),
            accessorFn: (r) => r.asset.name,
            cell: ({ row }) => (
                <span className="text-content-default">
                    {row.original.asset.key ? `${row.original.asset.key} · ` : ''}
                    {row.original.asset.name}
                </span>
            ),
        },
        {
            id: 'severity',
            header: t('colSeverity'),
            accessorFn: (r) => r.cve.cvssSeverity ?? '',
            cell: ({ row }) => {
                const sev = (row.original.cve.cvssSeverity ?? '').toUpperCase();
                if (!sev) return <span className="text-content-muted">—</span>;
                return <StatusBadge variant={SEVERITY_VARIANT[sev] ?? 'neutral'}>{sev}</StatusBadge>;
            },
        },
        {
            id: 'cvss',
            header: t('colCvss'),
            accessorFn: (r) => r.cve.cvssScore ?? -1,
            cell: ({ row }) => (
                <span className="tabular-nums text-content-muted">
                    {row.original.cve.cvssScore != null ? row.original.cve.cvssScore.toFixed(1) : '—'}
                </span>
            ),
        },
        {
            id: 'matchedVia',
            header: t('colMatched'),
            accessorFn: (r) => r.matchedVia,
            cell: ({ row }) => <span className="text-content-muted">{row.original.matchedVia}</span>,
        },
        {
            id: 'status',
            header: t('colStatus'),
            accessorFn: (r) => r.status,
            cell: ({ row }) => (
                <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
                    {VULN_STATUS_LABELS[row.original.status as keyof typeof VULN_STATUS_LABELS] ?? row.original.status}
                </StatusBadge>
            ),
        },
        ...(canWrite
            ? [{
                id: 'actions',
                header: '',
                cell: ({ row }: { row: { original: VulnRow } }) => (
                    <div className="flex justify-end gap-default">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pendingId === row.original.id}
                            onClick={() => convert(row.original, 'risk')}
                        >
                            {t('toRisk')}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pendingId === row.original.id}
                            onClick={() => convert(row.original, 'finding')}
                        >
                            {t('toFinding')}
                        </Button>
                    </div>
                ),
            }]
            : []),
    ]), [canWrite, convert, pendingId, t]);

    return (
        <EntityListPage<VulnRow>
            header={{
                back: { smart: true },
                breadcrumbs: [
                    { label: t('crumbDashboard'), href: `/t/${tenantSlug}/dashboard` },
                    { label: t('crumbRisk'), href: `/t/${tenantSlug}/risks` },
                    { label: t('crumbTitle') },
                ],
                title: (
                    <>
                        <ShieldAlert className="inline-block mr-2 h-5 w-5 align-text-bottom" />
                        {t('title')}
                    </>
                ),
                description: t('description'),
            }}
            filters={{ defs: buildVulnFilters() }}
            table={{
                data: rows,
                columns,
                getRowId: (r) => r.id,
                resourceName: (plural) => (plural ? t('resourcePlural') : t('resourceSingular')),
                emptyState: (
                    <EmptyState
                        icon={ShieldAlert}
                        title={hasActive ? t('emptyFilteredTitle') : t('emptyTitle')}
                        description={hasActive ? t('emptyFilteredDesc') : t('emptyDesc')}
                    />
                ),
            }}
        />
    );
}
