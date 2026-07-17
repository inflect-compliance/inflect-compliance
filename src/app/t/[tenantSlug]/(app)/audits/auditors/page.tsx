'use client';
import { formatDate } from '@/lib/format-date';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { AppIcon } from '@/components/icons/AppIcon';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/hooks';
import { cardVariants } from '@/components/ui/card';
import { Plus, UserPlus, Xmark } from '@/components/ui/icons/nucleo';
import { cn } from '@/lib/cn';

interface PackAccessRef { auditPackId: string; grantedAt: string }
interface AuditorRow {
    id: string;
    email: string;
    name: string | null;
    status: 'INVITED' | 'ACTIVE' | 'REVOKED';
    createdAt: string;
    packAccess: PackAccessRef[];
}
interface PackRow { id: string; name: string; status: string }

const STATUS_BADGE: Record<AuditorRow['status'], StatusBadgeVariant> = {
    INVITED: 'neutral', ACTIVE: 'success', REVOKED: 'warning',
};

export default function AuditorsManagementPage() {
    const params = useParams();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);
    const tx = useTranslations('audits');
    const toast = useToast();

    const [auditors, setAuditors] = useState<AuditorRow[]>([]);
    const [packs, setPacks] = useState<PackRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [inviting, setInviting] = useState(false);

    const [selectedPack, setSelectedPack] = useState<Record<string, string>>({});
    const [busyAuditor, setBusyAuditor] = useState<string | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<{ auditorId: string; packId: string } | null>(null);
    const [revokeAccountTarget, setRevokeAccountTarget] = useState<AuditorRow | null>(null);

    const loadAuditors = useCallback(() => {
        return fetch(apiUrl('/audits/auditors'))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
            .then((d: AuditorRow[]) => setAuditors(Array.isArray(d) ? d : []))
            .catch(() => toast.error(tx('auditorsAdmin.loadError')));
    }, [apiUrl, toast, tx]);

    useEffect(() => {
        Promise.all([
            fetch(apiUrl('/audits/auditors')).then((r) => (r.ok ? r.json() : [])),
            fetch(apiUrl('/audits/packs')).then((r) => (r.ok ? r.json() : [])),
        ])
            .then(([a, p]) => {
                setAuditors(Array.isArray(a) ? a : []);
                setPacks(Array.isArray(p) ? p : []);
            })
            .catch(() => toast.error(tx('auditorsAdmin.loadError')))
            .finally(() => setLoading(false));
    }, [apiUrl, toast, tx]);

    const packName = useCallback(
        (id: string) => packs.find((p) => p.id === id)?.name ?? tx('auditorsAdmin.packFallback'),
        [packs, tx],
    );

    const submitInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (inviting) return;
        setInviting(true);
        try {
            const res = await fetch(apiUrl('/audits/auditors'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined }),
            });
            if (res.ok) {
                // PR-O — surface reactivation: inviting an existing/REVOKED
                // auditor flips them back to ACTIVE. Say so, rather than a
                // generic "invited" that hides the state change.
                const data = await res.json().catch(() => null);
                setInviteOpen(false);
                setInviteEmail('');
                setInviteName('');
                await loadAuditors();
                toast.success(data?.reactivated ? tx('auditorsAdmin.reactivateSuccess') : tx('auditorsAdmin.inviteSuccess'));
            } else {
                toast.error(tx('auditorsAdmin.inviteError'));
            }
        } catch {
            toast.error(tx('auditorsAdmin.inviteError'));
        } finally {
            setInviting(false);
        }
    };

    const grantAccess = async (auditorId: string) => {
        const packId = selectedPack[auditorId];
        if (!packId) return;
        setBusyAuditor(auditorId);
        try {
            const res = await fetch(apiUrl('/audits/auditors/access'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auditorId, packId }),
            });
            if (res.ok) {
                setSelectedPack((s) => ({ ...s, [auditorId]: '' }));
                await loadAuditors();
                toast.success(tx('auditorsAdmin.grantSuccess'));
            } else {
                toast.error(tx('auditorsAdmin.grantError'));
            }
        } catch {
            toast.error(tx('auditorsAdmin.grantError'));
        } finally {
            setBusyAuditor(null);
        }
    };

    const revokeAccess = async (auditorId: string, packId: string) => {
        const res = await fetch(apiUrl('/audits/auditors/access'), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auditorId, packId }),
        });
        if (res.ok) {
            await loadAuditors();
            toast.success(tx('auditorsAdmin.revokeSuccess'));
        } else {
            toast.error(tx('auditorsAdmin.revokeError'));
        }
    };

    // PR-O — account-level revoke: flip the whole AuditorAccount to REVOKED and
    // drop every pack grant in one action (distinct from removing a single pack).
    const revokeAccount = async (auditorId: string) => {
        const res = await fetch(apiUrl(`/audits/auditors/${auditorId}`), { method: 'DELETE' });
        if (res.ok) {
            await loadAuditors();
            toast.success(tx('auditorsAdmin.revokeAccountSuccess'));
        } else {
            toast.error(tx('auditorsAdmin.revokeAccountError'));
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <SkeletonCard lines={4} />
            </div>
        );
    }

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-compact">
                <div>
                    <PageBreadcrumbs
                        items={[
                            { label: tx('crumb.dashboard'), href: `/t/${tenantSlug}/dashboard` },
                            { label: tx('crumb.audits'), href: `/t/${tenantSlug}/audits` },
                            { label: tx('auditorsAdmin.crumb') },
                        ]}
                        className="mb-1"
                    />
                    <Heading level={1} id="auditors-admin-heading">{tx('auditorsAdmin.title')}</Heading>
                    <p className="text-content-muted text-sm">{tx('auditorsAdmin.subtitle')}</p>
                </div>
                <Button
                    variant="primary"
                    icon={<Plus className="-ml-0.5 -mr-2.5" />}
                    onClick={() => setInviteOpen(true)}
                    id="invite-auditor-btn"
                >
                    {tx('auditorsAdmin.inviteAuditor')}
                </Button>
            </div>

            {auditors.length === 0 ? (
                <div className={cardVariants({ density: 'none' })}>
                    <EmptyState
                        icon={UserPlus}
                        title={tx('auditorsAdmin.emptyTitle')}
                        description={tx('auditorsAdmin.emptyDesc')}
                    />
                </div>
            ) : (
                <div className="space-y-default">
                    {auditors.map((a) => {
                        const grantedIds = new Set(a.packAccess.map((p) => p.auditPackId));
                        const options: ComboboxOption[] = packs
                            .filter((p) => !grantedIds.has(p.id))
                            .map((p) => ({ value: p.id, label: p.name }));
                        const chosen = selectedPack[a.id] ?? '';
                        return (
                            <div key={a.id} className={cn(cardVariants(), 'space-y-default')} id={`auditor-${a.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-compact">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">{a.name || a.email}</p>
                                        <p className="text-xs text-content-subtle truncate">{a.email}</p>
                                    </div>
                                    <div className="flex items-center gap-tight">
                                        <StatusBadge variant={STATUS_BADGE[a.status]}>{tx(`auditorsAdmin.status${a.status}`)}</StatusBadge>
                                        <span className="text-xs text-content-subtle">{tx('auditorsAdmin.invitedOn', { date: formatDate(a.createdAt) })}</span>
                                        {a.status !== 'REVOKED' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setRevokeAccountTarget(a)}
                                                id={`revoke-account-${a.id}`}
                                            >
                                                {tx('auditorsAdmin.revokeAccount')}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-tight">
                                    <p className="text-xs font-medium text-content-muted">{tx('auditorsAdmin.accessSection')}</p>
                                    {a.packAccess.length === 0 ? (
                                        <p className="text-xs text-content-subtle">{tx('auditorsAdmin.noAccess')}</p>
                                    ) : (
                                        <ul className="flex flex-wrap gap-tight">
                                            {a.packAccess.map((pa) => (
                                                <li key={pa.auditPackId} className="inline-flex items-center gap-tight rounded-full border border-border-subtle bg-bg-elevated px-2 py-1 text-xs">
                                                    <AppIcon name="package" size={12} />
                                                    <span className="truncate max-w-trunc-default">{packName(pa.auditPackId)}</span>
                                                    <button
                                                        type="button"
                                                        className="text-content-subtle hover:text-content-error transition"
                                                        aria-label={tx('auditorsAdmin.revokeAccessAria', { pack: packName(pa.auditPackId) })}
                                                        onClick={() => setRevokeTarget({ auditorId: a.id, packId: pa.auditPackId })}
                                                    >
                                                        <Xmark className="h-3 w-3" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-tight">
                                    <div className="flex-1 min-w-0">
                                        <Combobox
                                            options={options}
                                            selected={options.find((o) => o.value === chosen) ?? null}
                                            setSelected={(opt) => setSelectedPack((s) => ({ ...s, [a.id]: opt?.value ?? '' }))}
                                            placeholder={options.length === 0 ? tx('auditorsAdmin.allGranted') : tx('auditorsAdmin.grantPlaceholder')}
                                            disabled={options.length === 0}
                                            matchTriggerWidth
                                            aria-label={tx('auditorsAdmin.grantPlaceholder')}
                                        />
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => grantAccess(a.id)}
                                        disabled={!chosen || busyAuditor === a.id}
                                        loading={busyAuditor === a.id}
                                        id={`grant-access-${a.id}`}
                                    >
                                        {tx('auditorsAdmin.grant')}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Invite auditor modal */}
            <Modal showModal={inviteOpen} setShowModal={setInviteOpen} size="md" title={tx('auditorsAdmin.inviteTitle')} preventDefaultClose={inviting}>
                <Modal.Header title={tx('auditorsAdmin.inviteTitle')} description={tx('auditorsAdmin.inviteDesc')} />
                <Modal.Form id="invite-auditor-form" onSubmit={submitInvite}>
                    <Modal.Body>
                        <fieldset disabled={inviting} className="m-0 p-0 border-0 space-y-default">
                            <FormField label={tx('auditorsAdmin.emailLabel')} required>
                                <Input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder={tx('auditorsAdmin.emailPlaceholder')}
                                    required
                                    id="invite-auditor-email"
                                />
                            </FormField>
                            <FormField label={tx('auditorsAdmin.nameLabel')}>
                                <Input
                                    value={inviteName}
                                    onChange={(e) => setInviteName(e.target.value)}
                                    placeholder={tx('auditorsAdmin.namePlaceholder')}
                                    id="invite-auditor-name"
                                />
                            </FormField>
                        </fieldset>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" onClick={() => setInviteOpen(false)} disabled={inviting} id="invite-auditor-cancel">
                            {tx('auditorsAdmin.cancel')}
                        </Button>
                        <Button type="submit" variant="primary" size="sm" disabled={inviting || !inviteEmail} id="invite-auditor-submit">
                            {inviting ? tx('auditorsAdmin.inviting') : tx('auditorsAdmin.inviteSubmit')}
                        </Button>
                    </Modal.Actions>
                </Modal.Form>
            </Modal>

            {/* Revoke access confirmation */}
            <ConfirmDialog
                showModal={revokeTarget !== null}
                setShowModal={(open) => { if (!open) setRevokeTarget(null); }}
                tone="danger"
                title={tx('auditorsAdmin.revokeAccessTitle')}
                description={tx('auditorsAdmin.revokeAccessDesc')}
                confirmLabel={tx('auditorsAdmin.revokeAccessConfirm')}
                cancelLabel={tx('auditorsAdmin.cancel')}
                onConfirm={async () => {
                    if (revokeTarget) await revokeAccess(revokeTarget.auditorId, revokeTarget.packId);
                    setRevokeTarget(null);
                }}
            />

            {/* Account-level revoke confirmation */}
            <ConfirmDialog
                showModal={revokeAccountTarget !== null}
                setShowModal={(open) => { if (!open) setRevokeAccountTarget(null); }}
                tone="danger"
                title={tx('auditorsAdmin.revokeAccountTitle')}
                description={tx('auditorsAdmin.revokeAccountDesc', { name: revokeAccountTarget?.name || revokeAccountTarget?.email || '' })}
                confirmLabel={tx('auditorsAdmin.revokeAccountConfirm')}
                cancelLabel={tx('auditorsAdmin.cancel')}
                onConfirm={async () => {
                    if (revokeAccountTarget) await revokeAccount(revokeAccountTarget.id);
                    setRevokeAccountTarget(null);
                }}
            />
        </div>
    );
}
