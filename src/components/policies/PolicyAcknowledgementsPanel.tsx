'use client';

/**
 * Policy Acknowledgements tab (Prompt-1.3).
 *
 * Three surfaces in one panel:
 *   • the current user's own acknowledge button (when the policy is PUBLISHED);
 *   • an admin roster — required vs acknowledged, % complete, timestamps;
 *   • an admin "Request acknowledgement" action (audience: all members / a role).
 *
 * All copy is localized under `policies.ack.*`. Self-contained data fetching
 * against the attestation API added in Prompt-1.1/1.2.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { formatDate } from '@/lib/format-date';

interface RosterEntry {
    userId: string;
    name: string | null;
    email: string | null;
    required: boolean;
    acknowledgedAt: string | null;
}
interface Roster {
    policyVersionId: string | null;
    assignedCount: number;
    acknowledgedCount: number;
    pctComplete: number;
    entries: RosterEntry[];
}

const ROLE_VALUES = ['OWNER', 'ADMIN', 'EDITOR', 'READER', 'AUDITOR'] as const;

export function PolicyAcknowledgementsPanel({
    policyId,
    canAdmin,
    isPublished,
}: {
    policyId: string;
    canAdmin: boolean;
    isPublished: boolean;
}) {
    const t = useTranslations('policies');
    const apiUrl = useTenantApiUrl();

    const [ownAttested, setOwnAttested] = useState<boolean | null>(null);
    const [ownAt, setOwnAt] = useState<string | null>(null);
    const [attesting, setAttesting] = useState(false);
    const [roster, setRoster] = useState<Roster | null>(null);
    const [requestOpen, setRequestOpen] = useState(false);
    const [audienceType, setAudienceType] = useState<'all' | 'role'>('all');
    const [role, setRole] = useState<(typeof ROLE_VALUES)[number]>('READER');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const loadOwn = useCallback(async () => {
        const res = await fetch(apiUrl(`/policies/${policyId}/attestation`));
        if (res.ok) {
            const data = (await res.json()) as { attested: boolean; attestation: { acknowledgedAt: string } | null };
            setOwnAttested(data.attested);
            setOwnAt(data.attestation?.acknowledgedAt ?? null);
        }
    }, [apiUrl, policyId]);

    const loadRoster = useCallback(async () => {
        if (!canAdmin) return;
        const res = await fetch(apiUrl(`/policies/${policyId}/attestations`));
        if (res.ok) setRoster((await res.json()) as Roster);
    }, [apiUrl, policyId, canAdmin]);

    useEffect(() => {
        void loadOwn();
        void loadRoster();
    }, [loadOwn, loadRoster]);

    const acknowledge = async () => {
        setAttesting(true);
        setMessage(null);
        try {
            const res = await fetch(apiUrl(`/policies/${policyId}/attest`), { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            await loadOwn();
            await loadRoster();
            setMessage({ kind: 'ok', text: t('ack.acknowledgedToast') });
        } catch {
            setMessage({ kind: 'err', text: t('ack.acknowledgeFailed') });
        } finally {
            setAttesting(false);
        }
    };

    const submitRequest = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            const audience = audienceType === 'all' ? { type: 'all' } : { type: 'role', role };
            const res = await fetch(apiUrl(`/policies/${policyId}/acknowledgement-requests`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audience }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as { assignedCount: number };
            setRequestOpen(false);
            await loadRoster();
            setMessage({ kind: 'ok', text: t('ack.requestedToast', { count: data.assignedCount }) });
        } catch {
            setMessage({ kind: 'err', text: t('ack.requestFailed') });
        } finally {
            setSubmitting(false);
        }
    };

    const roleOptions: ComboboxOption[] = ROLE_VALUES.map((r) => ({ value: r, label: t(`ack.role.${r}`) }));

    return (
        <div className="space-y-section" id="policy-acknowledgements">
            {message && (
                <p className={message.kind === 'ok' ? 'text-sm text-content-success' : 'text-sm text-content-error'}>
                    {message.text}
                </p>
            )}

            {/* Own acknowledgement */}
            <div className="rounded-lg border border-border-default p-4 space-y-default">
                <h3 className="text-sm font-semibold text-content-emphasis">{t('ack.yourStatusTitle')}</h3>
                {!isPublished ? (
                    <p className="text-sm text-content-muted">{t('ack.notPublished')}</p>
                ) : ownAttested ? (
                    <p className="text-sm text-content-default">
                        {t('ack.youAcknowledged', { date: ownAt ? formatDate(ownAt) : '' })}
                    </p>
                ) : (
                    <div className="flex items-center gap-default">
                        <p className="text-sm text-content-muted flex-1">{t('ack.youOutstanding')}</p>
                        <Button onClick={acknowledge} disabled={attesting} data-testid="policy-acknowledge-button">
                            {attesting ? t('ack.acknowledging') : t('ack.acknowledge')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Admin roster */}
            {canAdmin && (
                <div className="rounded-lg border border-border-default p-4 space-y-default">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-content-emphasis">{t('ack.rosterTitle')}</h3>
                        {isPublished && (
                            <Button variant="secondary" size="sm" onClick={() => setRequestOpen(true)} data-testid="policy-request-ack-button">
                                {t('ack.requestAck')}
                            </Button>
                        )}
                    </div>

                    {roster && roster.assignedCount > 0 ? (
                        <>
                            <div className="space-y-tight">
                                <div className="flex items-center justify-between text-xs text-content-muted">
                                    <span>{t('ack.percentComplete', { pct: roster.pctComplete })}</span>
                                    <span>{t('ack.completedOf', { done: roster.acknowledgedCount, total: roster.assignedCount })}</span>
                                </div>
                                <ProgressBar value={roster.pctComplete} />
                            </div>
                            <ul className="divide-y divide-border-subtle">
                                {roster.entries.map((e) => (
                                    <li key={e.userId} className="flex items-center justify-between py-2 text-sm">
                                        <span className="min-w-0 truncate">
                                            <span className="text-content-default">{e.name || e.email || e.userId}</span>
                                            {!e.required && <span className="ml-2 text-xs text-content-muted">{t('ack.voluntary')}</span>}
                                        </span>
                                        {e.acknowledgedAt ? (
                                            <StatusBadge variant="success">{formatDate(e.acknowledgedAt)}</StatusBadge>
                                        ) : (
                                            <StatusBadge variant="warning">{t('ack.outstanding')}</StatusBadge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="text-sm text-content-muted">{t('ack.noneRequired')}</p>
                    )}
                </div>
            )}

            {requestOpen && (
                <Modal showModal={requestOpen} setShowModal={setRequestOpen}>
                    <Modal.Header title={t('ack.requestTitle')} />
                    <Modal.Body>
                        <div className="space-y-default">
                            <FormField label={t('ack.audienceLabel')}>
                                <Combobox
                                    hideSearch
                                    id="policy-ack-audience"
                                    selected={{ value: audienceType, label: audienceType === 'all' ? t('ack.audienceAll') : t('ack.audienceRole') }}
                                    setSelected={(o) => setAudienceType((o?.value as 'all' | 'role') ?? 'all')}
                                    options={[
                                        { value: 'all', label: t('ack.audienceAll') },
                                        { value: 'role', label: t('ack.audienceRole') },
                                    ]}
                                    matchTriggerWidth
                                />
                            </FormField>
                            {audienceType === 'role' && (
                                <FormField label={t('ack.roleLabel')}>
                                    <Combobox
                                        hideSearch
                                        id="policy-ack-role"
                                        selected={roleOptions.find((o) => o.value === role) ?? null}
                                        setSelected={(o) => setRole((o?.value as (typeof ROLE_VALUES)[number]) ?? 'READER')}
                                        options={roleOptions}
                                        matchTriggerWidth
                                    />
                                </FormField>
                            )}
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setRequestOpen(false)}>{t('ack.cancel')}</Button>
                        <Button onClick={submitRequest} disabled={submitting} data-testid="policy-ack-request-submit">
                            {submitting ? t('ack.requesting') : t('ack.requestConfirm')}
                        </Button>
                    </Modal.Footer>
                </Modal>
            )}
        </div>
    );
}
