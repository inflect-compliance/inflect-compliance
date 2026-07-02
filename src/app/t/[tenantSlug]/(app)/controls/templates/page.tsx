'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { AppIcon } from '@/components/icons/AppIcon';
import { Button } from '@/components/ui/button';
import { DataTable, createColumns, TableEmptyState } from '@/components/ui/table';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { InlineNotice } from '@/components/ui/inline-notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { cn } from '@/lib/cn';

// listControlTemplates → ControlTemplateRepository.list (ControlTemplate model).
interface ControlTemplateRow {
    id: string;
    code: string;
    title: string;
    category: string | null;
    description: string | null;
}

export default function ControlTemplatesPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();
    const { permissions } = useTenantContext();


    const [templates, setTemplates] = useState<ControlTemplateRow[]>([]);
    const [loading, setLoading] = useState(true);
    // R14-PR7 — search state retired. Users find templates via the
    // global command palette (⌘K) or by scanning the list. The
    // category dimension lives in `categories` below if a future PR
    // adopts FilterToolbar.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        const res = await fetch(apiUrl('/controls/templates'));
        if (res.ok) setTemplates(await res.json());
        setLoading(false);
    }, [apiUrl]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    const toggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(t => t.id)));
        }
    };

    const handleInstall = async () => {
        if (selectedIds.size === 0) return;
        setInstalling(true);
        setError('');
        try {
            const res = await fetch(apiUrl('/controls/templates/install'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateIds: Array.from(selectedIds) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(typeof data.error === 'string' ? data.error : data.message || 'Failed to install templates');
            }
            const result = await res.json();
            const count = Array.isArray(result) ? result.length : 1;
            setSuccess(`Installed ${count} control(s) successfully!`);
            setTimeout(() => router.push(tenantHref('/controls')), 1500);

        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setInstalling(false);
        }
    };

    const filtered = templates;


    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Heading level={1} id="templates-heading"><AppIcon name="templates" className="inline-block mr-2 align-text-bottom" /> Control Templates</Heading>
                    <p className="text-content-muted text-sm">Select templates to install as controls in your register</p>
                </div>
            </div>

            {error && (
                <InlineNotice variant="error" icon={null}>{error}</InlineNotice>
            )}
            {success && (
                <InlineNotice variant="success" icon={null} id="install-success">{success}</InlineNotice>
            )}

            {/* Install bar — R14-PR7 dropped the standalone search
                input above this row. Find templates via ⌘K palette
                or scan the list. */}
            {permissions.canWrite && (
                <div className={cardVariants({ density: 'compact' })}>
                    <div className="flex items-center justify-end">
                        <Button
                            variant="primary"
                            onClick={handleInstall}
                            disabled={selectedIds.size === 0 || installing}
                            id="install-selected-btn"
                        >
                            {installing ? 'Installing...' : `Install Selected (${selectedIds.size})`}
                        </Button>
                    </div>
                </div>
            )}

            {/* Template list */}
            <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                {loading ? (
                    <div className="p-12 text-center text-content-subtle animate-pulse">Loading templates…</div>
                ) : filtered.length === 0 ? (
                    <InlineEmptyState
                        title="No templates yet"
                        description="Templates are seeded by your admin."
                    />
                ) : (
                    (() => {
                        const templateCols = createColumns<ControlTemplateRow>([
                            {
                                id: 'select', header: () => (
                                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
                                ),
                                cell: ({ row }) => (
                                    <input type="checkbox" checked={selectedIds.has(row.original.id)} onChange={() => toggle(row.original.id)} className="rounded" />
                                ),
                            },
                            { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span className="text-xs text-content-muted font-mono">{getValue() || '—'}</span> },
                            { accessorKey: 'title', header: 'Name', cell: ({ getValue }) => <span className="font-medium text-content-emphasis">{getValue()}</span> },
                            {
                                accessorKey: 'category', header: 'Category',
                                cell: ({ getValue }) => getValue() ? <StatusBadge variant="info">{getValue()}</StatusBadge> : null,
                            },
                            { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => <span className="text-xs text-content-subtle truncate max-w-xs">{getValue() || '—'}</span> },
                        ]);
                        return (
                            <DataTable
                                data={filtered}
                                columns={templateCols}
                                getRowId={(t) => t.id}
                                onRowClick={(row) => toggle(row.original.id)}
                                emptyState={
                                    <TableEmptyState
                                        title="No templates yet"
                                        description="Templates are seeded by your admin."
                                    />
                                }
                                resourceName={(p) => p ? 'templates' : 'template'}
                                data-testid="templates-table"
                            />
                        );
                    })()
                )}
            </div>
        </div>
    );
}
