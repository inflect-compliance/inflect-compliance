'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { ShieldCheck, Save, AlertTriangle, CheckCircle, LogOut, Users, UserX } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';
import { BackAffordance } from '@/components/nav/BackAffordance';

type MfaPolicy = 'DISABLED' | 'OPTIONAL' | 'REQUIRED';

interface SecuritySettings {
    mfaPolicy: MfaPolicy;
    sessionMaxAgeMinutes: number | null;
}

const POLICY_OPTIONS: { value: MfaPolicy; label: string; description: string }[] = [
    {
        value: 'DISABLED',
        label: 'Disabled',
        description: 'MFA is not available. Users cannot enroll in multi-factor authentication.',
    },
    {
        value: 'OPTIONAL',
        label: 'Optional',
        description: 'Users can choose to enable MFA. Enrolled users will be challenged at login.',
    },
    {
        value: 'REQUIRED',
        label: 'Required',
        description: 'All users must enroll in MFA. Users without MFA will be redirected to enrollment on login.',
    },
];

export default function AdminSecurityPage() {
    const apiUrl = useTenantApiUrl();
    const [settings, setSettings] = useState<SecuritySettings>({ mfaPolicy: 'DISABLED', sessionMaxAgeMinutes: null });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [revokeUserId, setRevokeUserId] = useState('');

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/security/mfa/policy'));
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
            }
        } catch {
            setError('Failed to load security settings');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(apiUrl('/security/mfa/policy'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
            const updated = await res.json();
            setSettings(updated);
            setSuccess('Security settings saved successfully.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleRevokeMySessions = async () => {
        if (!confirm('This will sign you out of all devices. Continue?')) return;
        setRevoking(true);
        setError(null);
        try {
            const res = await fetch(apiUrl('/security/sessions/revoke-current'), { method: 'POST' });
            if (res.ok) {
                setSuccess('Your sessions have been revoked. You will be signed out shortly.');
                setTimeout(() => window.location.href = '/login', 2000);
            } else {
                throw new Error('Failed to revoke sessions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Revocation failed');
        } finally {
            setRevoking(false);
        }
    };

    const handleRevokeAllTenant = async () => {
        if (!confirm('WARNING: This will sign out ALL users in your organization. Are you sure?')) return;
        setRevoking(true);
        setError(null);
        try {
            const res = await fetch(apiUrl('/security/sessions/revoke-all'), { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setSuccess(`Sessions revoked for ${data.usersAffected} users. Everyone will need to sign in again.`);
            } else {
                throw new Error(data.error || 'Failed to revoke');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bulk revocation failed');
        } finally {
            setRevoking(false);
        }
    };

    const handleRevokeUser = async () => {
        if (!revokeUserId.trim()) return;
        if (!confirm(`Revoke all sessions for user ${revokeUserId}?`)) return;
        setRevoking(true);
        setError(null);
        try {
            const res = await fetch(apiUrl('/security/sessions/revoke-user'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: revokeUserId.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess('Sessions revoked for user.');
                setRevokeUserId('');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                throw new Error(data.error || 'Failed to revoke user sessions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'User revocation failed');
        } finally {
            setRevoking(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-[var(--brand-default)]" />
                    Security & MFA
                </h1>
                <div className="glass-card p-8">
                    <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-bg-elevated rounded w-1/3" />
                        <div className="h-10 bg-bg-elevated rounded w-full" />
                        <div className="h-10 bg-bg-elevated rounded w-full" />
                        <div className="h-10 bg-bg-elevated rounded w-full" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            <BackAffordance />
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-[var(--brand-default)]" />
                Security & MFA
            </h1>

            {error && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-red-300">{error}</span>
                </div>
            )}

            {success && (
                <div className="glass-card p-4 border border-green-500/50 bg-green-500/10 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm text-green-300">{success}</span>
                </div>
            )}

            {/* MFA Policy Section */}
            <div className="glass-card p-6 space-y-5">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-content-emphasis">Multi-Factor Authentication Policy</h2>
                        <InfoTooltip
                            aria-label="About the MFA policy"
                            iconClassName="h-4 w-4"
                            content="Applies tenant-wide on the next login. Switching to Required forces everyone who isn't enrolled into the enrolment flow before they can access any page."
                        />
                    </div>
                    <p className="text-sm text-content-muted mt-1">
                        Configure whether MFA is required, optional, or disabled for your organization.
                    </p>
                </div>

                <div className="space-y-3">
                    {POLICY_OPTIONS.map((option) => (
                        <label
                            key={option.value}
                            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                                settings.mfaPolicy === option.value
                                    ? 'border-[var(--brand-default)]/60 bg-[var(--brand-subtle)]'
                                    : 'border-border-default hover:border-border-emphasis'
                            }`}
                        >
                            <input
                                type="radio"
                                name="mfaPolicy"
                                value={option.value}
                                checked={settings.mfaPolicy === option.value}
                                onChange={() => setSettings(s => ({ ...s, mfaPolicy: option.value }))}
                                className="mt-1 accent-[var(--brand-default)]"
                            />
                            <div>
                                <span className={`text-sm font-medium ${
                                    settings.mfaPolicy === option.value ? 'text-[var(--brand-muted)]' : 'text-content-emphasis'
                                }`}>
                                    {option.label}
                                    {option.value === 'REQUIRED' && (
                                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            Strict
                                        </span>
                                    )}
                                </span>
                                <p className="text-xs text-content-muted mt-1">{option.description}</p>
                            </div>
                        </label>
                    ))}
                </div>

                {settings.mfaPolicy === 'REQUIRED' && (
                    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm text-amber-300 font-medium">Before enabling Required MFA:</p>
                                <ul className="text-xs text-amber-200/70 mt-1 list-disc pl-4 space-y-1">
                                    <li>Ensure you (the admin) have enrolled in MFA first</li>
                                    <li>Users without MFA will be redirected to enrollment on their next login</li>
                                    <li>Break-glass admin access is preserved via SSO if configured</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Session Settings */}
            <div className="glass-card p-6 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-content-emphasis mb-1">Session Settings</h2>
                    <p className="text-sm text-content-muted">
                        Configure session timeout for your organization. Leave blank for the default.
                    </p>
                </div>

                <div>
                    <div className="mb-1 flex items-center gap-1.5">
                        <label className="block text-sm text-content-default">Maximum Session Age (minutes)</label>
                        <InfoTooltip
                            aria-label="About session max age"
                            iconClassName="h-3.5 w-3.5"
                            content="Absolute lifetime of a login session — users must re-authenticate after this many minutes regardless of activity. Leave blank to inherit the platform default."
                        />
                    </div>
                    <input
                        type="number"
                        min={5}
                        max={43200}
                        placeholder="Default (no limit)"
                        value={settings.sessionMaxAgeMinutes ?? ''}
                        onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                            setSettings(s => ({ ...s, sessionMaxAgeMinutes: val }));
                        }}
                        className="input w-full max-w-xs"
                    />
                    <p className="text-xs text-content-subtle mt-1">Min: 5 minutes. Max: 30 days (43200 min).</p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary"
                    id="security-save-btn"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {/* ──── Session Management ──── */}
            <div className="glass-card p-6 space-y-5">
                <div>
                    <h2 className="text-lg font-semibold text-content-emphasis mb-1">Session Management</h2>
                    <p className="text-sm text-content-muted">
                        Revoke active sessions. Revoked users must sign in again.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Revoke my sessions */}
                    <button
                        onClick={handleRevokeMySessions}
                        disabled={revoking}
                        className="p-4 border border-border-default rounded-lg hover:border-[var(--brand-default)]/50 transition text-left flex items-start gap-3 group"
                        id="revoke-my-sessions-btn"
                    >
                        <LogOut className="w-5 h-5 text-content-muted group-hover:text-[var(--brand-default)] transition mt-0.5 shrink-0" />
                        <div>
                            <span className="text-sm font-medium text-content-emphasis">Sign Out Other Sessions</span>
                            <p className="text-xs text-content-subtle mt-1">Invalidate all your active sessions across devices.</p>
                        </div>
                    </button>

                    {/* Revoke all tenant sessions */}
                    <button
                        onClick={handleRevokeAllTenant}
                        disabled={revoking}
                        className="p-4 border border-red-500/30 rounded-lg hover:border-red-500/60 transition text-left flex items-start gap-3 group"
                        id="revoke-all-sessions-btn"
                    >
                        <Users className="w-5 h-5 text-red-400/70 group-hover:text-red-400 transition mt-0.5 shrink-0" />
                        <div>
                            <span className="text-sm font-medium text-red-300">Revoke All User Sessions</span>
                            <p className="text-xs text-content-subtle mt-1">Force all organization members to sign in again. Use for incidents.</p>
                        </div>
                    </button>
                </div>

                {/* Revoke specific user */}
                <div className="border-t border-border-default/50 pt-4">
                    <label className="block text-sm text-content-default mb-2">Revoke sessions for a specific user</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="User ID"
                            value={revokeUserId}
                            onChange={(e) => setRevokeUserId(e.target.value)}
                            className="input flex-1"
                            id="revoke-user-id-input"
                        />
                        <button
                            onClick={handleRevokeUser}
                            disabled={revoking || !revokeUserId.trim()}
                            className="btn btn-secondary text-red-400 hover:text-red-300"
                            id="revoke-user-btn"
                        >
                            <UserX className="w-4 h-4" />
                            Revoke
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
