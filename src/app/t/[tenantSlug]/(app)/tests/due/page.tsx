'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- Client component receiving server-rendered domain data; tanstack column callbacks; or library-boundary callbacks. Per-site narrowing requires generated DTOs / per-cell CellContext imports — out of scope for the lint cleanup PR. */
import { formatDate } from '@/lib/format-date';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DataTable, createColumns } from '@/components/ui/table';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

interface DuePlan {
    id: string;
    name: string;
    frequency: string;
    nextDueAt: string | null;
    controlId: string;
    isOverdue: boolean;
    hasPendingRun: boolean;
    control: { id: string; name: string; code: string | null };
    owner: { id: string; name: string | null; email: string } | null;
    _count: { runs: number };
}

const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

export default function DueQueuePage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();

    const [queue, setQueue] = useState<DuePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [planning, setPlanning] = useState(false);
    const [planningResult, setPlanningResult] = useState<{ checked: number; created: number; alreadyPending: number } | null>(null);
    const [error, setError] = useState('');

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl('/tests/due'));
            if (res.ok) setQueue(await res.json());
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    const handleRunDuePlanning = async () => {
        setPlanning(true);
        setPlanningResult(null);
        setError('');
        try {
            const res = await fetch(apiUrl('/tests/due'), { method: 'POST' });
            if (res.ok) {
                const result = await res.json();
                setPlanningResult(result);
                await fetchQueue();
            } else {
                setError('Failed to run due planning');
            }
        } finally {
            setPlanning(false);
        }
    };

    const handleQuickRun = async (planId: string) => {
        const res = await fetch(apiUrl(`/tests/plans/${planId}/runs`), { method: 'POST' });
        if (res.ok) {
            const run = await res.json();
            window.location.href = tenantHref(`/tests/runs/${run.id}`);
        }
    };

    const overdueCount = queue.filter(p => p.isOverdue).length;
    const pendingCount = queue.filter(p => p.hasPendingRun).length;

    if (loading) return <div className="p-12 text-center text-content-subtle animate-pulse">Loading due queue...</div>;

    return (
        <ListPageShell className="animate-fadeIn gap-6">
            <ListPageShell.Header>
                <BackAffordance />
                <div className="flex items-center justify-between mt-1">
                    <div>
                        <h1 className="text-2xl font-bold" id="due-queue-title">Due Queue</h1>
                        <p className="text-sm text-content-muted mt-1">Test plans due or overdue for execution</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href={tenantHref('/tests/dashboard')} className="btn btn-ghost btn-sm">Dashboard</Link>
                        {permissions.canWrite && (
                            <button
                                onClick={handleRunDuePlanning}
                                disabled={planning}
                                className="btn btn-primary btn-sm"
                                id="run-due-planning-btn"
                            >
                                {planning ? 'Running...' : 'Run Due Planning'}
                            </button>
                        )}
                    </div>
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-6">
                {/* Planning result */}
            {planningResult && (
                <div className="glass-card p-4 border border-green-500/30 bg-green-500/5" id="planning-result">
                    <p className="text-sm text-green-400">
                        Due planning complete: checked {planningResult.checked} plans,
                        created {planningResult.created} new runs,
                        {planningResult.alreadyPending} already had pending runs.
                    </p>
                </div>
            )}
            {error && <div className="glass-card p-4 border border-red-500/30 text-red-400 text-sm">{error}</div>}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-bold text-[var(--brand-default)]">{queue.length}</div>
                    <div className="text-xs text-content-muted mt-1">Due / Due Soon</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{overdueCount}</div>
                    <div className="text-xs text-content-muted mt-1">Overdue</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-400' : 'text-content-subtle'}`}>{pendingCount}</div>
                    <div className="text-xs text-content-muted mt-1">Pending Runs</div>
                </div>
            </div>

            </ListPageShell.Filters>

            <ListPageShell.Body>
                {/* Queue Table */}
                {(() => {
                const dueColumns = createColumns<DuePlan>([
                    {
                        id: 'plan', header: 'Plan', accessorKey: 'name',
                        cell: ({ row }) => (
                            <Link href={tenantHref(`/controls/${row.original.controlId}/tests/${row.original.id}`)} className="text-content-emphasis font-medium hover:text-[var(--brand-default)] transition">
                                {row.original.name}
                            </Link>
                        ),
                    },
                    {
                        id: 'control', header: 'Control', accessorFn: (p) => p.control?.code || p.control?.name || '—',
                        cell: ({ row }) => (
                            <Link href={tenantHref(`/controls/${row.original.controlId}`)} className="text-content-muted hover:text-content-emphasis text-xs transition">
                                {row.original.control?.code || row.original.control?.name || '—'}
                            </Link>
                        ),
                    },
                    { id: 'frequency', header: 'Frequency', accessorFn: (p) => FREQ_LABELS[p.frequency] || p.frequency },
                    {
                        id: 'dueDate', header: 'Due Date', accessorKey: 'nextDueAt',
                        cell: ({ row }) => (
                            <span className={row.original.isOverdue ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                                {formatDate(row.original.nextDueAt)}
                                {row.original.isOverdue && ' !'}
                            </span>
                        ),
                    },
                    { id: 'owner', header: 'Owner', accessorFn: (p) => p.owner?.name || p.owner?.email || '—', cell: ({ getValue }: any) => <span className="text-content-muted text-xs">{getValue()}</span> },
                    {
                        id: 'status', header: 'Status',
                        cell: ({ row }) => row.original.hasPendingRun
                            ? <span className="badge badge-xs badge-warning">Run Pending</span>
                            : <span className="badge badge-xs badge-danger">Needs Run</span>,
                    },
                    {
                        id: 'actions', header: '',
                        cell: ({ row }) => !row.original.hasPendingRun && permissions.canWrite ? (
                            <button onClick={() => handleQuickRun(row.original.id)} className="btn btn-xs btn-primary">Run Now</button>
                        ) : null,
                    },
                ]);
                return (
                    <DataTable
                        fillBody
                        data={queue}
                        columns={dueColumns}
                        getRowId={(p) => p.id}
                        emptyState="No tests are due! All plans are on schedule."
                        resourceName={(p) => p ? 'test plans' : 'test plan'}
                        data-testid="due-queue-table"
                    />
                );
            })()}
            </ListPageShell.Body>
        </ListPageShell>
    );
}
