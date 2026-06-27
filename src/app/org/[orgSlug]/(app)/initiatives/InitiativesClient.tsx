'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable, createColumns } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Heading } from '@/components/ui/typography';
import { formatDate } from '@/lib/format-date';

type Row = {
    id: string;
    title: string;
    status: string;
    ownerUserId: string | null;
    targetDate: string | null;
    manualProgressPercent: number | null;
    linkCount: number;
    tenantSpan: number;
};

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'error' | 'success'> = {
    PLANNED: 'neutral',
    IN_PROGRESS: 'info',
    BLOCKED: 'error',
    COMPLETED: 'success',
    CANCELLED: 'neutral',
};

function atRisk(r: Row): boolean {
    if (r.status === 'BLOCKED') return true;
    if (!r.targetDate || r.status === 'COMPLETED' || r.status === 'CANCELLED') return false;
    return new Date(r.targetDate).getTime() < Date.now();
}

export function InitiativesClient({
    orgSlug,
    canManage,
    initiatives,
}: {
    orgSlug: string;
    canManage: boolean;
    initiatives: Row[];
}) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);

    const columns = useMemo(
        () =>
            createColumns<Row>([
                {
                    accessorKey: 'title',
                    header: 'Initiative',
                    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
                },
                {
                    accessorKey: 'status',
                    header: 'Status',
                    cell: ({ row }) => (
                        <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'} size="sm">
                            {row.original.status}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'risk',
                    header: 'Risk',
                    cell: ({ row }) =>
                        atRisk(row.original) ? (
                            <StatusBadge variant="warning" size="sm">At risk</StatusBadge>
                        ) : (
                            <span className="text-content-muted text-xs">—</span>
                        ),
                },
                {
                    id: 'linked',
                    header: 'Linked work',
                    cell: ({ row }) => (
                        <span className="text-content-muted tabular-nums">
                            {row.original.linkCount}
                            {row.original.tenantSpan > 0 ? ` · ${row.original.tenantSpan} tenant${row.original.tenantSpan === 1 ? '' : 's'}` : ''}
                        </span>
                    ),
                },
                {
                    accessorKey: 'targetDate',
                    header: 'Target',
                    cell: ({ row }) =>
                        row.original.targetDate ? (
                            <span className="text-content-muted">{formatDate(new Date(row.original.targetDate))}</span>
                        ) : (
                            <span className="text-content-muted text-xs">—</span>
                        ),
                },
            ]),
        [],
    );

    return (
        <div className="space-y-section p-4">
            <div className="flex items-center justify-between gap-compact flex-wrap">
                <Heading level={1}>Security initiatives</Heading>
                {canManage && (
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                        New initiative
                    </Button>
                )}
            </div>

            <DataTable
                data={initiatives}
                columns={columns}
                getRowId={(r) => r.id}
                onRowClick={(r) => router.push(`/org/${orgSlug}/initiatives/${r.id}`)}
            />

            {createOpen && (
                <CreateInitiativeModal
                    orgSlug={orgSlug}
                    onClose={() => setCreateOpen(false)}
                    onCreated={(id) => router.push(`/org/${orgSlug}/initiatives/${id}`)}
                />
            )}
        </div>
    );
}

function CreateInitiativeModal({
    orgSlug,
    onClose,
    onCreated,
}: {
    orgSlug: string;
    onClose: () => void;
    onCreated: (id: string) => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!title.trim()) {
            setError('A title is required.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/org/${orgSlug}/initiatives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: description || null }),
            });
            if (!res.ok) throw new Error('Failed to create initiative.');
            const data = await res.json();
            onCreated(data.initiative.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create initiative.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal showModal setShowModal={(o) => (o ? null : onClose())}>
            <Modal.Header title="New security initiative" />
            <Modal.Body>
                <div className="space-y-default">
                    <input
                        className="w-full rounded-md border border-border-subtle bg-bg-default p-2 text-sm"
                        placeholder="Title (e.g. Roll out MFA across all subsidiaries)"
                        maxLength={200}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                    <textarea
                        className="w-full rounded-md border border-border-subtle bg-bg-default p-2 text-sm"
                        rows={3}
                        placeholder="Description (optional)"
                        maxLength={8000}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    {error && <p className="text-sm text-content-error">{error}</p>}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Modal.Actions>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={save} disabled={saving}>
                        Create initiative
                    </Button>
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}
