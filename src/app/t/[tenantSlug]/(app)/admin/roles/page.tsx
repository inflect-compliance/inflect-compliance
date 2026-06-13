'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { getPermissionsForRole, type PermissionSet } from '@/lib/permissions';
import {
    Shield, Plus, Pencil, Trash2, XCircle, CheckCircle, Check,
    ChevronDown, ChevronUp, Users,
} from 'lucide-react';
import type { Role } from '@prisma/client';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { BackAffordance } from '@/components/nav/BackAffordance';

// ─── Types ───

interface CustomRole {
    id: string;
    name: string;
    description: string | null;
    baseRole: Role;
    permissionsJson: PermissionSet;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    _count: { memberships: number };
}

// ─── Permission Schema (must match src/lib/permissions.ts PERMISSION_SCHEMA) ───

const PERMISSION_SCHEMA: Record<keyof PermissionSet, string[]> = {
    controls: ['view', 'create', 'edit'],
    evidence: ['view', 'upload', 'edit', 'download'],
    policies: ['view', 'create', 'edit', 'approve'],
    tasks: ['view', 'create', 'edit', 'assign'],
    risks: ['view', 'create', 'edit'],
    vendors: ['view', 'create', 'edit'],
    tests: ['view', 'create', 'execute'],
    frameworks: ['view', 'install'],
    audits: ['view', 'manage', 'freeze', 'share'],
    reports: ['view', 'export'],
    admin: ['view', 'manage', 'members', 'sso', 'scim'],
};

const RESOURCE_LABELS: Record<string, string> = {
    controls: 'Controls',
    evidence: 'Evidence',
    policies: 'Policies',
    tasks: 'Tasks',
    risks: 'Risks',
    vendors: 'Vendors',
    tests: 'Tests',
    frameworks: 'Frameworks',
    audits: 'Audits',
    reports: 'Reports',
    admin: 'Admin',
};

const BASE_ROLES: Role[] = ['ADMIN', 'EDITOR', 'AUDITOR', 'READER'];
const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'badge-danger',
    EDITOR: 'badge-info',
    AUDITOR: 'badge-warning',
    READER: 'badge-neutral',
};
const BASE_ROLE_OPTIONS: ComboboxOption[] = BASE_ROLES.map(r => ({ value: r, label: r }));

// ─── Permission Grid Component ───

function PermissionGrid({
    permissions,
    onChange,
    readonly = false,
}: {
    permissions: PermissionSet;
    onChange: (p: PermissionSet) => void;
    readonly?: boolean;
}) {
    const toggle = (resource: keyof PermissionSet, action: string) => {
        if (readonly) return;
        const current = (permissions[resource] as Record<string, boolean>)[action];
        const updated = {
            ...permissions,
            [resource]: {
                ...permissions[resource],
                [action]: !current,
            },
        };
        onChange(updated);
    };

    // Collect all unique actions across all resources for column headers
    const allActions = Array.from(
        new Set(Object.values(PERMISSION_SCHEMA).flat())
    );

    return (
        <div className="overflow-x-auto">
            <table className="data-table text-xs">
                <thead>
                    <tr>
                        <th className="sticky left-0 bg-bg-default/90 z-10 text-left">Resource</th>
                        {allActions.map((action) => (
                            <th key={action} className="text-center capitalize px-2">
                                {action}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(Object.keys(PERMISSION_SCHEMA) as (keyof PermissionSet)[]).map((resource) => {
                        const resourceActions = PERMISSION_SCHEMA[resource];
                        return (
                            <tr key={resource}>
                                <td className="sticky left-0 bg-bg-default/50 text-xs font-medium text-content-default">
                                    {RESOURCE_LABELS[resource]}
                                </td>
                                {allActions.map((action) => {
                                    const hasAction = resourceActions.includes(action);
                                    if (!hasAction) {
                                        return <td key={action} className="text-center"><span className="text-content-subtle">—</span></td>;
                                    }
                                    const granted = (permissions[resource] as Record<string, boolean>)[action] ?? false;
                                    return (
                                        <td key={action} className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggle(resource, action)}
                                                disabled={readonly}
                                                className={`
                                                    inline-flex items-center justify-center w-5 h-5 rounded transition
                                                    ${granted
                                                        ? 'bg-emerald-500/30 text-emerald-400 hover:bg-emerald-500/50'
                                                        : 'bg-bg-elevated/50 text-content-subtle hover:bg-bg-elevated/80'
                                                    }
                                                    ${readonly ? 'cursor-default' : 'cursor-pointer'}
                                                `}
                                                title={`${resource}.${action}: ${granted ? 'granted' : 'denied'}`}
                                                id={`perm-${resource}-${action}`}
                                            >
                                                {granted ? <Check size={10} /> : null}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Role Form Component ───

function RoleForm({
    initial,
    onSubmit,
    onCancel,
    submitting,
    submitLabel,
}: {
    initial?: CustomRole;
    onSubmit: (data: { name: string; description: string; baseRole: Role; permissionsJson: PermissionSet }) => void;
    onCancel: () => void;
    submitting: boolean;
    submitLabel: string;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [baseRole, setBaseRole] = useState<Role>(initial?.baseRole ?? 'READER');
    const [permissions, setPermissions] = useState<PermissionSet>(
        initial?.permissionsJson ?? getPermissionsForRole('READER'),
    );
    const [showGrid, setShowGrid] = useState(!!initial);

    // Load preset when baseRole changes (only in create mode)
    const handleBaseRoleChange = (role: Role) => {
        setBaseRole(role);
        if (!initial) {
            setPermissions(getPermissionsForRole(role));
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">
                        Role Name *
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Compliance Lead"
                        className="input w-full"
                        maxLength={100}
                        id="role-name-input"
                    />
                </div>
                <div>
                    <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">
                        Base Role (fallback)
                    </label>
                    <Combobox
                        hideSearch
                        id="role-base-select"
                        selected={BASE_ROLE_OPTIONS.find(o => o.value === baseRole) ?? null}
                        setSelected={(opt) => { if (opt) handleBaseRoleChange(opt.value as Role); }}
                        options={BASE_ROLE_OPTIONS}
                        matchTriggerWidth
                    />
                    <p className="text-[10px] text-content-subtle mt-1">
                        Used for coarse authorization when custom permissions don&apos;t apply.
                    </p>
                </div>
            </div>

            <div>
                <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">
                    Description
                </label>
                <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional — describe what this role is for"
                    className="input w-full"
                    maxLength={500}
                    id="role-description-input"
                />
            </div>

            {/* Permission Grid */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className="flex items-center gap-1 text-sm text-[var(--brand-default)] hover:text-[var(--brand-muted)] transition"
                    id="toggle-permissions-btn"
                >
                    {showGrid ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showGrid ? 'Hide' : 'Show'} Permission Grid
                </button>
                {showGrid && (
                    <div className="mt-3 glass-card p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs text-content-muted uppercase tracking-wider">Permissions</h4>
                            <div className="flex gap-1">
                                <span className="text-[10px] text-content-subtle">Preset from:</span>
                                {BASE_ROLES.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setPermissions(getPermissionsForRole(r))}
                                        className="text-[10px] px-2 py-0.5 rounded bg-bg-elevated/50 text-content-default hover:bg-bg-muted/50 transition"
                                        id={`preset-${r}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <PermissionGrid permissions={permissions} onChange={setPermissions} />
                    </div>
                )}
            </div>

            <div className="flex gap-2 pt-2">
                <button
                    type="button"
                    onClick={() => onSubmit({ name: name.trim(), description: description.trim(), baseRole, permissionsJson: permissions })}
                    disabled={submitting || !name.trim()}
                    className="btn btn-primary"
                    id="role-submit-btn"
                >
                    {submitting ? 'Saving...' : submitLabel}
                </button>
                <button type="button" onClick={onCancel} className="btn btn-secondary">
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── Main Page ───

export default function CustomRolesPage() {
    const apiUrl = useTenantApiUrl();

    const [roles, setRoles] = useState<CustomRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // ─── Data Fetching ───
    const fetchRoles = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/admin/roles'));
            if (res.ok) {
                const data = await res.json();
                // Only show active roles
                setRoles(data.filter((r: CustomRole) => r.isActive));
            }
        } catch {
            setError('Failed to load custom roles');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchRoles(); }, [fetchRoles]);

    // ─── Create ───
    async function handleCreate(data: { name: string; description: string; baseRole: Role; permissionsJson: PermissionSet }) {
        setError(null);
        setSuccess(null);
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/admin/roles'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Create failed' }));
                setError(err.error?.message || err.error || err.message || 'Create failed');
                return;
            }
            setSuccess(`Custom role "${data.name}" created successfully.`);
            setShowCreate(false);
            await fetchRoles();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // ─── Update ───
    async function handleUpdate(roleId: string, data: { name: string; description: string; baseRole: Role; permissionsJson: PermissionSet }) {
        setError(null);
        setSuccess(null);
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl(`/admin/roles/${roleId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Update failed' }));
                setError(err.error?.message || err.error || err.message || 'Update failed');
                return;
            }
            setSuccess(`Custom role "${data.name}" updated successfully.`);
            setEditingId(null);
            await fetchRoles();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // ─── Delete ───
    async function handleDelete(role: CustomRole) {
        const memberWarning = role._count.memberships > 0
            ? `\n\n${role._count.memberships} member(s) will lose this custom role and fall back to their base role.`
            : '';
        if (!confirm(`Delete "${role.name}"?${memberWarning}`)) return;

        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(apiUrl(`/admin/roles/${role.id}`), { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Delete failed' }));
                setError(err.error?.message || err.error || err.message || 'Delete failed');
                return;
            }
            const result = await res.json();
            setSuccess(`Deleted "${role.name}". ${result.membersCleared} member(s) reassigned to fallback.`);
            await fetchRoles();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    // ─── Permission summary for table display ───
    function countGranted(perms: PermissionSet): string {
        let granted = 0;
        let total = 0;
        for (const resource of Object.keys(PERMISSION_SCHEMA) as (keyof PermissionSet)[]) {
            for (const action of PERMISSION_SCHEMA[resource]) {
                total++;
                if ((perms[resource] as Record<string, boolean>)[action]) granted++;
            }
        }
        return `${granted}/${total}`;
    }

    // ─── Loading ───
    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Shield className="w-6 h-6 text-[var(--brand-default)]" />
                    Custom Roles
                </h1>
                <div className="glass-card p-8 space-y-4">
                    <div className="h-4 bg-bg-elevated/50 rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-bg-elevated/50 rounded w-2/3 animate-pulse" />
                    <div className="h-4 bg-bg-elevated/50 rounded w-1/2 animate-pulse" />
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
                        <Shield className="w-6 h-6 text-[var(--brand-default)]" />
                        Custom Roles
                    </h1>
                    <p className="text-sm text-content-muted mt-1">
                        {roles.length} custom role{roles.length !== 1 ? 's' : ''} defined.
                        Members assigned a custom role use its permissions instead of the built-in role defaults.
                    </p>
                </div>
                {!showCreate && !editingId && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn btn-primary"
                        id="create-role-btn"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Create Custom Role
                    </button>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2" id="roles-error">
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2" id="roles-success">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm text-emerald-400">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Create Form */}
            {showCreate && (
                <div className="glass-card p-6 border border-[var(--brand-default)]/30" id="create-role-form">
                    <h3 className="text-sm font-semibold text-content-emphasis mb-4">Create Custom Role</h3>
                    <RoleForm
                        onSubmit={handleCreate}
                        onCancel={() => setShowCreate(false)}
                        submitting={submitting}
                        submitLabel="Create Role"
                    />
                </div>
            )}

            {/* Roles Table */}
            <div className="glass-card overflow-hidden" id="roles-table-card">
                <table className="data-table" id="roles-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Base Role</th>
                            <th>Description</th>
                            <th>Members</th>
                            <th>Permissions</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map((role) => (
                            editingId === role.id ? (
                                <tr key={role.id}>
                                    <td colSpan={6} className="p-4">
                                        <h3 className="text-sm font-semibold text-content-emphasis mb-4">
                                            Edit: {role.name}
                                        </h3>
                                        <RoleForm
                                            initial={role}
                                            onSubmit={(data) => handleUpdate(role.id, data)}
                                            onCancel={() => setEditingId(null)}
                                            submitting={submitting}
                                            submitLabel="Save Changes"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                <tr key={role.id} data-role-id={role.id}>
                                    <td className="text-sm font-medium text-content-emphasis">{role.name}</td>
                                    <td>
                                        <span className={`badge ${ROLE_COLORS[role.baseRole] || 'badge-neutral'}`}>
                                            {role.baseRole}
                                        </span>
                                    </td>
                                    <td className="text-xs text-content-muted max-w-xs truncate">
                                        {role.description || '—'}
                                    </td>
                                    <td>
                                        <span className="flex items-center gap-1 text-xs text-content-default">
                                            <Users className="w-3 h-3" />
                                            {role._count.memberships}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="text-xs text-content-muted font-mono">
                                            {countGranted(role.permissionsJson)}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <div className="flex gap-1 justify-end">
                                            <Tooltip content="Edit role">
                                                <button
                                                    onClick={() => setEditingId(role.id)}
                                                    className="btn btn-secondary text-xs py-1 px-2"
                                                    aria-label="Edit role"
                                                    id={`edit-role-${role.id}`}
                                                >
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            </Tooltip>
                                            <Tooltip content="Delete role">
                                                <button
                                                    onClick={() => handleDelete(role)}
                                                    className="btn btn-secondary text-xs py-1 px-2 text-red-400 hover:bg-red-500/10"
                                                    aria-label="Delete role"
                                                    id={`delete-role-${role.id}`}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                        {roles.length === 0 && !showCreate && (
                            <tr>
                                <td colSpan={6} className="text-center text-content-subtle py-8">
                                    No custom roles defined yet. Click &quot;Create Custom Role&quot; to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
