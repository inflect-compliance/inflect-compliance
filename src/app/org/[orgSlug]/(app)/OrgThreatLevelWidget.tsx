'use client';

/**
 * ORG_THREAT_LEVEL widget — human-curated org-wide threat posture banner.
 *
 * Concept ported from Cybether (MIT). Escalating colour is the ONE
 * deliberate alert-tone exception in the dashboard: GUARDED/LOW are
 * quiet, ELEVATED is warning-toned, HIGH/SEVERE are error-toned with
 * more visual weight — the whole point is to be impossible to miss.
 *
 * Provenance + staleness are first-class: curated signals go stale, so a
 * posture older than 30 days renders a muted "may be stale" note.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, History } from 'lucide-react';

import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Sheet } from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { OrgThreatLevelDto } from '@/app-layer/usecases/org-threat-level';
import { formatDate } from '@/lib/format-date';

const TIERS = ['GUARDED', 'LOW', 'ELEVATED', 'HIGH', 'SEVERE'] as const;
type Tier = (typeof TIERS)[number];

const TIER_VARIANT: Record<Tier, 'neutral' | 'info' | 'warning' | 'error'> = {
    GUARDED: 'neutral',
    LOW: 'info',
    ELEVATED: 'warning',
    HIGH: 'error',
    SEVERE: 'error',
};
const TIER_LABEL: Record<Tier, string> = {
    GUARDED: 'Guarded',
    LOW: 'Low',
    ELEVATED: 'Elevated',
    HIGH: 'High',
    SEVERE: 'Severe',
};
// HIGH/SEVERE get a tinted banner surface for extra weight.
const BANNER_SURFACE: Record<Tier, string> = {
    GUARDED: 'bg-bg-subtle',
    LOW: 'bg-bg-info/40',
    ELEVATED: 'bg-bg-warning/50',
    HIGH: 'bg-bg-error/50',
    SEVERE: 'bg-bg-error/70',
};

const STALE_DAYS = 30;

function daysSince(iso: string | null): number | null {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function OrgThreatLevelWidget({
    data,
    canSet,
    showHistory,
    orgSlug,
}: {
    data: OrgThreatLevelDto;
    canSet: boolean;
    showHistory: boolean;
    orgSlug: string;
}) {
    const router = useRouter();
    const level = (TIERS as readonly string[]).includes(data.level) ? (data.level as Tier) : 'GUARDED';
    const age = daysSince(data.setAt);
    const isStale = age !== null && age > STALE_DAYS;

    const [editOpen, setEditOpen] = useState(false);
    const [histOpen, setHistOpen] = useState(false);

    return (
        <div className={`flex h-full flex-col gap-tight rounded-lg p-4 ${BANNER_SURFACE[level]}`} data-testid="org-threat-level-widget">
            <div className="flex items-start justify-between gap-compact flex-wrap">
                <div className="flex items-center gap-compact">
                    <ShieldAlert className="w-5 h-5 text-content-muted" aria-hidden="true" />
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-content-muted">Threat level</p>
                        <StatusBadge variant={TIER_VARIANT[level]} size="md" tone="solid">
                            {TIER_LABEL[level]}
                        </StatusBadge>
                    </div>
                </div>
                <div className="flex items-center gap-tight">
                    {showHistory && !data.isDefault && (
                        <Button variant="ghost" size="sm" onClick={() => setHistOpen(true)}>
                            <History className="w-3.5 h-3.5" /> History
                        </Button>
                    )}
                    {canSet && (
                        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                            Update
                        </Button>
                    )}
                </div>
            </div>

            <p className="text-sm text-content-default font-medium">{data.summary}</p>
            {data.detail && <p className="text-xs text-content-muted">{data.detail}</p>}

            {/* Provenance */}
            <p className="text-xs text-content-muted">
                {data.isDefault
                    ? 'No posture set yet.'
                    : `Set ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}${data.setByName ? ` by ${data.setByName}` : ''}.`}
            </p>

            {/* Staleness — curated signals go stale; make it visible. */}
            {isStale && (
                <p className="text-xs text-content-warning" data-testid="org-threat-level-stale">
                    Last updated {age} days ago — may be stale.
                </p>
            )}

            {/* Mini 5-level legend */}
            <div className="mt-auto flex flex-wrap gap-tight pt-2">
                {TIERS.map((t) => (
                    <span
                        key={t}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${t === level ? 'ring-1 ring-border-emphasis' : 'opacity-60'}`}
                    >
                        <StatusBadge variant={TIER_VARIANT[t]} size="sm">
                            {TIER_LABEL[t]}
                        </StatusBadge>
                    </span>
                ))}
            </div>

            {editOpen && (
                <UpdateThreatModal
                    orgSlug={orgSlug}
                    current={level}
                    onClose={() => setEditOpen(false)}
                    onSaved={() => {
                        setEditOpen(false);
                        router.refresh();
                    }}
                />
            )}
            {histOpen && (
                <ThreatHistorySheet orgSlug={orgSlug} open={histOpen} onClose={() => setHistOpen(false)} />
            )}
        </div>
    );
}

function UpdateThreatModal({
    orgSlug,
    current,
    onClose,
    onSaved,
}: {
    orgSlug: string;
    current: Tier;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [level, setLevel] = useState<Tier>(current);
    const [summary, setSummary] = useState('');
    const [detail, setDetail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(async () => {
        if (!summary.trim()) {
            setError('A summary is required.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/org/${orgSlug}/threat-level`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level, summary, detail: detail || null }),
            });
            if (!res.ok) throw new Error('Failed to set the threat level.');
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to set the threat level.');
        } finally {
            setSaving(false);
        }
    }, [orgSlug, level, summary, detail, onSaved]);

    return (
        <Modal showModal setShowModal={(o) => (o ? null : onClose())}>
            <Modal.Header title="Update threat level" />
            <Modal.Body>
                <div className="space-y-default">
                    <RadioGroup value={level} onValueChange={(v) => setLevel(v as Tier)} className="space-y-tight">
                        {TIERS.map((t) => (
                            <label key={t} className="flex items-center gap-tight text-sm cursor-pointer">
                                <RadioGroupItem value={t} />
                                <StatusBadge variant={TIER_VARIANT[t]} size="sm">
                                    {TIER_LABEL[t]}
                                </StatusBadge>
                            </label>
                        ))}
                    </RadioGroup>
                    <input
                        className="w-full rounded-md border border-border-subtle bg-bg-default p-2 text-sm"
                        placeholder="Headline (e.g. Active phishing campaign targeting finance)"
                        maxLength={280}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                    />
                    <textarea
                        className="w-full rounded-md border border-border-subtle bg-bg-default p-2 text-sm"
                        rows={3}
                        placeholder="Optional context for the estate…"
                        maxLength={4000}
                        value={detail}
                        onChange={(e) => setDetail(e.target.value)}
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
                        Set threat level
                    </Button>
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}

function ThreatHistorySheet({
    orgSlug,
    open,
    onClose,
}: {
    orgSlug: string;
    open: boolean;
    onClose: () => void;
}) {
    const [rows, setRows] = useState<OrgThreatLevelDto[] | null>(null);
    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/org/${orgSlug}/threat-level/history`);
            if (!res.ok) return;
            const data = await res.json();
            setRows(data.history ?? []);
        } catch {
            /* best-effort */
        }
    }, [orgSlug]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
        >
            <Sheet.Header title="Threat level history" />
            <Sheet.Body>
                <div className="space-y-default">
                    {(rows ?? []).map((r, i) => {
                        const tier = (TIERS as readonly string[]).includes(r.level) ? (r.level as Tier) : 'GUARDED';
                        return (
                            <div key={i} className="border-b border-border-subtle pb-2">
                                <StatusBadge variant={TIER_VARIANT[tier]} size="sm">
                                    {TIER_LABEL[tier]}
                                </StatusBadge>
                                <p className="text-sm text-content-default mt-1">{r.summary}</p>
                                <p className="text-xs text-content-muted">
                                    {r.setAt ? formatDate(new Date(r.setAt)) : ''}
                                    {r.setByName ? ` · ${r.setByName}` : ''}
                                </p>
                            </div>
                        );
                    })}
                    {rows !== null && rows.length === 0 && (
                        <p className="text-sm text-content-muted">No history yet.</p>
                    )}
                </div>
            </Sheet.Body>
        </Sheet>
    );
}
