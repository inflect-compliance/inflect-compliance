'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Client component receiving server-rendered domain data; tanstack column callbacks; or library-boundary callbacks. Per-site narrowing requires generated DTOs / per-cell CellContext imports — out of scope for the lint cleanup PR. */
import { formatDateTime } from '@/lib/format-date';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DataTable, createColumns } from '@/components/ui/table';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { StatusBadge } from '@/components/ui/status-badge';
import { cardVariants } from '@/components/ui/card';

interface AdminClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditLog: any[];
    tenantSlug: string;
    translations: {
        title: string;
        auditLog: string;
        policyTemplates: string;
        time: string;
        user: string;
        action: string;
        entity: string;
        details: string;
        noEntries: string;
        templateDescription: string;
        clickToUse: string;
        templateLabels: Record<string, string>;
    };
}

/**
 * Client island for admin page — handles tab state switching.
 * Audit log data and navigation links are pre-rendered server-side.
 */
export function AdminClient({ auditLog, tenantSlug, translations: t }: AdminClientProps) {
    const [tab, setTab] = useState<'log' | 'templates'>('log');
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const templateKeys = [
        'infoSecurity', 'accessControl', 'incidentResponse', 'acceptableUse',
        'supplierSecurity', 'backup', 'changeManagement', 'cryptography', 'logging',
    ] as const;

    // R13-PR8 — cell `text-xs` overrides removed so admin tables
    // render at the DataTable primitive's default `text-sm leading-6`,
    // matching Controls / Risks / etc. The legacy text-xs read as
    // visibly smaller rows than the rest of the product.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logColumns = useMemo(() => createColumns<any>([
        {
            id: 'time',
            header: t.time,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (e: any) => e.createdAt,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="whitespace-nowrap">{formatDateTime(getValue())}</span>,
        },
        {
            id: 'user',
            header: t.user,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (e: any) => e.user?.name || '—',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span>{getValue()}</span>,
        },
        {
            accessorKey: 'action',
            header: t.action,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <StatusBadge variant="info">{getValue()}</StatusBadge>,
        },
        {
            accessorKey: 'entity',
            header: t.entity,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span>{getValue()}</span>,
        },
        {
            accessorKey: 'details',
            header: t.details,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-content-muted max-w-xs truncate">{getValue()}</span>,
        },
    ]), [t]);

    return (
        <ListPageShell className="gap-default">
            <ListPageShell.Filters>
                {/* Epic 60 — ToggleGroup replaces the hand-rolled tab bar. */}
                <ToggleGroup
                    ariaLabel="Admin view"
                    options={[
                        { value: 'log', label: t.auditLog },
                        { value: 'templates', label: t.policyTemplates },
                    ]}
                    selected={tab}
                    selectAction={(v) => setTab(v as 'log' | 'templates')}
                />
            </ListPageShell.Filters>

            <ListPageShell.Body>
                {tab === 'log' ? (
                    <DataTable
                        fillBody
                        data={auditLog}
                        columns={logColumns}
                        getRowId={(e: any) => e.id}
                        emptyState={t.noEntries}
                        resourceName={(p) => p ? 'log entries' : 'log entry'}
                        data-testid="audit-log-table"
                    />
                ) : (
                    <div className={cardVariants()}>
                        <p className="text-sm text-content-muted mb-4">{t.templateDescription}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-compact">
                            {templateKeys.map(key => (
                                <div key={key} className="p-4 border border-border-default rounded-lg hover:border-[var(--brand-default)] transition cursor-pointer">
                                    <span className="text-sm font-medium text-content-emphasis">{t.templateLabels[key]}</span>
                                    <p className="text-xs text-content-subtle mt-1">{t.clickToUse}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </ListPageShell.Body>
        </ListPageShell>
    );
}
