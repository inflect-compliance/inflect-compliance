'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { VALID_SCOPES } from '@/lib/auth/api-key-auth';
import {
    KeyRound, Plus, Trash2, XCircle, CheckCircle, Copy, Check,
    Clock, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { InfoTooltip, Tooltip } from '@/components/ui/tooltip';
import { useCopyToClipboard } from '@/components/ui/hooks';
import { DataTable, createColumns } from '@/components/ui/table';
import { BackAffordance } from '@/components/nav/BackAffordance';
// Epic 58 — route through the canonical app-wide formatter so
// api-keys reads in the same date dialect (UTC, en-GB, em-dash
// fallback) as every other page. Previously used a local
// `toLocaleDateString('en-US', …)` that diverged from the rest of
// the app.
import { formatDateTime as formatDate } from '@/lib/format-date';
import { toast } from 'sonner';

// ─── Types ───

interface ApiKeyRecord {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    expiresAt: string | null;
    revokedAt: string | null;
    lastUsedAt: string | null;
    lastUsedIp: string | null;
    createdById: string;
    createdAt: string;
    createdBy: { id: string; name: string | null; email: string };
}

interface CreatedKeyResponse extends ApiKeyRecord {
    plaintext: string;
}

// ─── Scope Categories for UI Grouping ───

const SCOPE_GROUPS: Record<string, { label: string; scopes: string[] }> = {
    controls:   { label: 'Controls',   scopes: ['controls:read', 'controls:write'] },
    evidence:   { label: 'Evidence',   scopes: ['evidence:read', 'evidence:write'] },
    policies:   { label: 'Policies',   scopes: ['policies:read', 'policies:write', 'policies:admin'] },
    tasks:      { label: 'Tasks',      scopes: ['tasks:read', 'tasks:write'] },
    risks:      { label: 'Risks',      scopes: ['risks:read', 'risks:write'] },
    vendors:    { label: 'Vendors',    scopes: ['vendors:read', 'vendors:write'] },
    tests:      { label: 'Tests',      scopes: ['tests:read', 'tests:write'] },
    frameworks: { label: 'Frameworks', scopes: ['frameworks:read', 'frameworks:write'] },
    audits:     { label: 'Audits',     scopes: ['audits:read', 'audits:write'] },
    reports:    { label: 'Reports',    scopes: ['reports:read', 'reports:write'] },
    admin:      { label: 'Admin',      scopes: ['admin:read', 'admin:write'] },
};

const EXPIRY_OPTIONS = [
    { label: 'No expiry', value: '' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: '180 days', value: '180' },
    { label: '1 year', value: '365' },
];
const EXPIRY_CB_OPTIONS: ComboboxOption[] = EXPIRY_OPTIONS.filter(o => o.value).map(o => ({ value: o.value, label: o.label }));

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
}

// ─── Scope Picker Component ───

function ScopePicker({
    selected,
    onChange,
}: {
    selected: string[];
    onChange: (scopes: string[]) => void;
}) {
    const isFullAccess = selected.includes('*');

    const toggleFullAccess = () => {
        if (isFullAccess) {
            onChange([]);
        } else {
            onChange(['*']);
        }
    };

    const toggleScope = (scope: string) => {
        if (isFullAccess) return;
        if (selected.includes(scope)) {
            onChange(selected.filter(s => s !== scope));
        } else {
            onChange([...selected, scope]);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={toggleFullAccess}
                    className={`text-xs px-3 py-1.5 rounded-md transition font-medium ${
                        isFullAccess
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-bg-elevated/50 text-content-muted border border-border-emphasis/50 hover:border-border-emphasis'
                    }`}
                    id="scope-full-access"
                >
                    Full Access (*)
                </button>
                <InfoTooltip
                    aria-label="About the Full Access scope"
                    iconClassName="h-3.5 w-3.5"
                    content="Gives this key read + write on every resource — evidence, controls, admin settings. Prefer narrow scopes for automation."
                />
                {isFullAccess && (
                    <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Grants all permissions
                    </span>
                )}
            </div>

            {!isFullAccess && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(SCOPE_GROUPS).map(([, group]) => (
                        <div key={group.label} className="bg-bg-default/40 rounded-lg p-2 space-y-1">
                            <div className="text-[10px] text-content-subtle uppercase tracking-wider font-medium">
                                {group.label}
                            </div>
                            {group.scopes.map((scope) => {
                                const action = scope.split(':')[1];
                                const isSelected = selected.includes(scope);
                                return (
                                    <button
                                        key={scope}
                                        type="button"
                                        onClick={() => toggleScope(scope)}
                                        className={`
                                            w-full text-left text-[11px] px-2 py-1 rounded transition
                                            ${isSelected
                                                ? 'bg-[var(--brand-subtle)] text-[var(--brand-muted)] border border-[var(--brand-default)]/40'
                                                : 'bg-bg-elevated/30 text-content-muted border border-transparent hover:border-border-emphasis'
                                            }
                                        `}
                                        id={`scope-${scope.replace(':', '-')}`}
                                    >
                                        <span className="capitalize">{action}</span>
                                        {isSelected && <Check className="w-3 h-3 inline ml-1" />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Copy-Once Key Display ───

export function KeyDisplay({ plaintext }: { plaintext: string }) {
    const [visible, setVisible] = useState(false);
    const { copy, copied } = useCopyToClipboard({ timeout: 2500 });

    const handleCopy = async () => {
        const ok = await copy(plaintext);
        if (ok) {
            toast.success('API key copied — paste it into your tool now.');
        } else {
            toast.error('Copy failed — select the key and copy manually.');
        }
    };

    return (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2" id="key-display">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                Copy this key now — it will never be shown again!
            </div>
            <div className="flex items-center gap-2">
                <code className="flex-1 bg-bg-page px-3 py-2 rounded text-sm font-mono text-emerald-300 select-all break-all">
                    {visible ? plaintext : plaintext.slice(0, 13) + '•'.repeat(40)}
                </code>
                <Tooltip content={visible ? 'Hide key' : 'Show key'}>
                    <button
                        onClick={() => setVisible(!visible)}
                        className="btn btn-secondary text-xs py-2 px-2"
                        aria-label={visible ? 'Hide key' : 'Show key'}
                        id="key-toggle-visibility"
                    >
                        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                </Tooltip>
                <button
                    onClick={handleCopy}
                    className="btn btn-primary text-xs py-2 px-3"
                    id="key-copy-btn"
                >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
        </div>
    );
}

// ─── Main Page ───

export default function ApiKeysPage() {
    const apiUrl = useTenantApiUrl();

    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createScopes, setCreateScopes] = useState<string[]>([]);
    const [createExpiry, setCreateExpiry] = useState('');
    const [creating, setCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<CreatedKeyResponse | null>(null);

    // ─── Data Fetching ───
    const fetchKeys = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/admin/api-keys'));
            if (res.ok) setKeys(await res.json());
        } catch {
            setError('Failed to load API keys');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    // ─── Create ───
    async function handleCreate() {
        setError(null);
        setSuccess(null);
        setCreating(true);

        try {
            let expiresAt: string | null = null;
            if (createExpiry) {
                const date = new Date();
                date.setDate(date.getDate() + parseInt(createExpiry));
                expiresAt = date.toISOString();
            }

            const res = await fetch(apiUrl('/admin/api-keys'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: createName.trim(),
                    scopes: createScopes,
                    expiresAt,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Create failed' }));
                setError(err.error?.message || err.error || err.message || 'Create failed');
                return;
            }

            const result = await res.json();
            setCreatedKey(result);
            setSuccess(`API key "${createName}" created. Copy the key below.`);
            setCreateName('');
            setCreateScopes([]);
            setCreateExpiry('');
            setShowCreate(false);
            await fetchKeys();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    }

    // ─── Revoke ───
    async function handleRevoke(key: ApiKeyRecord) {
        if (!confirm(`Revoke API key "${key.name}" (${key.keyPrefix}...)?\n\nThis cannot be undone. Any integrations using this key will immediately lose access.`)) return;

        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(apiUrl(`/admin/api-keys/${key.id}`), { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Revoke failed' }));
                setError(err.error?.message || err.error || 'Revoke failed');
                return;
            }
            setSuccess(`API key "${key.name}" revoked successfully.`);
            await fetchKeys();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    // ─── Partition keys ───
    const activeKeys = keys.filter(k => !k.revokedAt && !isExpired(k.expiresAt));
    const inactiveKeys = keys.filter(k => k.revokedAt || isExpired(k.expiresAt));

    // ─── Epic 52 — DataTable columns ───
    const activeKeyColumns = useMemo(
        () =>
            createColumns<ApiKeyRecord>([
                {
                    accessorKey: 'name',
                    header: 'Name',
                    cell: ({ row }) => (
                        <span className="text-sm font-medium text-content-emphasis">{row.original.name}</span>
                    ),
                },
                {
                    accessorKey: 'keyPrefix',
                    header: 'Key',
                    cell: ({ row }) => (
                        <code className="text-xs text-content-muted font-mono">{row.original.keyPrefix}...</code>
                    ),
                },
                {
                    accessorKey: 'scopes',
                    header: 'Scopes',
                    cell: ({ row }) => {
                        const scopes = row.original.scopes as string[];
                        return (
                            <div className="flex flex-wrap gap-1">
                                {scopes.slice(0, 3).map((s) => (
                                    <span key={s} className="badge badge-info text-[10px]">{s}</span>
                                ))}
                                {scopes.length > 3 && (
                                    <span className="badge badge-neutral text-[10px]">+{scopes.length - 3}</span>
                                )}
                            </div>
                        );
                    },
                },
                {
                    accessorKey: 'expiresAt',
                    header: 'Expires',
                    cell: ({ row }) =>
                        row.original.expiresAt ? (
                            <span className="flex items-center gap-1 text-xs text-content-muted">
                                <Clock className="w-3 h-3" />
                                {formatDate(row.original.expiresAt)}
                            </span>
                        ) : (
                            <span className="text-xs text-content-subtle">Never</span>
                        ),
                },
                {
                    accessorKey: 'lastUsedAt',
                    header: 'Last Used',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-muted">{formatDate(row.original.lastUsedAt)}</span>
                    ),
                },
                {
                    accessorKey: 'createdAt',
                    header: 'Created',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle">
                            {formatDate(row.original.createdAt)}
                            <br />
                            <span className="text-content-subtle">
                                by {row.original.createdBy?.name || row.original.createdBy?.email || '—'}
                            </span>
                        </span>
                    ),
                },
                {
                    id: 'actions',
                    header: () => <span className="sr-only">Actions</span>,
                    cell: ({ row }) => (
                        <div className="text-right">
                            <Tooltip content="Revoke key">
                                <button
                                    onClick={() => handleRevoke(row.original)}
                                    className="btn btn-secondary text-xs py-1 px-2 text-red-400 hover:bg-red-500/10"
                                    aria-label="Revoke key"
                                    id={`revoke-key-${row.original.id}`}
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </Tooltip>
                        </div>
                    ),
                },
            ]),
        // handleRevoke identity is stable within this component — but we
        // include it so an eslint-exhaustive-deps warning doesn't slip in
        // if someone refactors it into a useCallback later.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const inactiveKeyColumns = useMemo(
        () =>
            createColumns<ApiKeyRecord>([
                {
                    accessorKey: 'name',
                    header: 'Name',
                    cell: ({ row }) => (
                        <span className="text-sm text-content-muted line-through">{row.original.name}</span>
                    ),
                },
                {
                    accessorKey: 'keyPrefix',
                    header: 'Key',
                    cell: ({ row }) => (
                        <code className="text-xs text-content-subtle font-mono">{row.original.keyPrefix}...</code>
                    ),
                },
                {
                    id: 'status',
                    header: 'Status',
                    cell: ({ row }) =>
                        row.original.revokedAt ? (
                            <span className="badge badge-danger text-[10px]">Revoked</span>
                        ) : (
                            <span className="badge badge-warning text-[10px]">Expired</span>
                        ),
                },
                {
                    accessorKey: 'createdAt',
                    header: 'Created',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle">{formatDate(row.original.createdAt)}</span>
                    ),
                },
            ]),
        [],
    );

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <KeyRound className="w-6 h-6 text-[var(--brand-default)]" />
                    API Keys
                </h1>
                <div className="glass-card p-8 space-y-4">
                    <div className="h-4 bg-bg-elevated/50 rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-bg-elevated/50 rounded w-2/3 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            <BackAffordance />
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <KeyRound className="w-6 h-6 text-[var(--brand-default)]" />
                        API Keys
                    </h1>
                    <p className="text-sm text-content-muted mt-1">
                        Manage machine-to-machine API keys for programmatic access.
                        Keys are scoped to specific resources and actions.
                    </p>
                </div>
                {!showCreate && !createdKey && (
                    <button onClick={() => setShowCreate(true)} className="btn btn-primary" id="create-api-key-btn">
                        <Plus className="w-3.5 h-3.5" />
                        Create API Key
                    </button>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2" id="api-keys-error">
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><XCircle className="w-3.5 h-3.5" /></button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2" id="api-keys-success">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm text-emerald-400">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300"><XCircle className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* Created Key Display (show once) */}
            {createdKey && (
                <div className="space-y-2">
                    <KeyDisplay plaintext={createdKey.plaintext} />
                    <button
                        onClick={() => setCreatedKey(null)}
                        className="btn btn-secondary text-xs"
                        id="dismiss-key-display"
                    >
                        I&apos;ve copied the key — dismiss
                    </button>
                </div>
            )}

            {/* Create Form */}
            {showCreate && (
                <div className="glass-card p-6 border border-[var(--brand-default)]/30 space-y-4" id="create-key-form">
                    <h3 className="text-sm font-semibold text-content-emphasis">Create API Key</h3>

                    <div>
                        <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">Name *</label>
                        <input
                            type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
                            placeholder="e.g. CI/CD Pipeline, Monitoring Agent"
                            className="input w-full" maxLength={100} id="key-name-input"
                        />
                    </div>

                    <div>
                        <div className="mb-1 flex items-center gap-1.5">
                            <label className="text-xs text-content-muted uppercase tracking-wider">Expiry</label>
                            <InfoTooltip
                                aria-label="About key expiry"
                                iconClassName="h-3.5 w-3.5"
                                content="Keys with no expiry stay valid until someone manually revokes them. Set a deadline for any automation or third-party integration."
                            />
                        </div>
                        <Combobox
                            hideSearch
                            id="key-expiry-select"
                            selected={EXPIRY_CB_OPTIONS.find(o => o.value === createExpiry) ?? null}
                            setSelected={(opt) => setCreateExpiry(opt?.value ?? '')}
                            options={EXPIRY_CB_OPTIONS}
                            placeholder="No expiry"
                            matchTriggerWidth
                            buttonProps={{ className: 'w-full sm:w-48' }}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-content-muted uppercase tracking-wider mb-2 block">Scopes *</label>
                        <ScopePicker selected={createScopes} onChange={setCreateScopes} />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={handleCreate}
                            disabled={creating || !createName.trim() || createScopes.length === 0}
                            className="btn btn-primary" id="key-submit-btn"
                        >
                            {creating ? 'Creating...' : 'Create Key'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
                    </div>
                </div>
            )}

            {/* Active Keys */}
            <div className="glass-card overflow-hidden" id="active-keys-card">
                <div className="px-4 py-3 border-b border-border-default/50">
                    <h3 className="text-sm font-semibold text-content-emphasis">Active Keys ({activeKeys.length})</h3>
                </div>
                <DataTable
                    data={activeKeys}
                    columns={activeKeyColumns}
                    getRowId={(k) => k.id}
                    emptyState="No active API keys."
                    resourceName={(p) => (p ? 'API keys' : 'API key')}
                    data-testid="active-keys-table"
                />
            </div>

            {/* Inactive/Revoked Keys */}
            {inactiveKeys.length > 0 && (
                <div className="glass-card overflow-hidden opacity-60" id="inactive-keys-card">
                    <div className="px-4 py-3 border-b border-border-default/50">
                        <h3 className="text-sm font-semibold text-content-muted">Revoked / Expired ({inactiveKeys.length})</h3>
                    </div>
                    <DataTable
                        data={inactiveKeys}
                        columns={inactiveKeyColumns}
                        getRowId={(k) => k.id}
                        emptyState="No revoked or expired keys."
                        resourceName={(p) => (p ? 'revoked keys' : 'revoked key')}
                        data-testid="inactive-keys-table"
                    />
                </div>
            )}
        </div>
    );
}
