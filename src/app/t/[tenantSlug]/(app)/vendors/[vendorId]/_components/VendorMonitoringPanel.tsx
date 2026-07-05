'use client';

/**
 * Vendor posture-monitoring panel — the continuous-assurance surface.
 *
 * Shows the monitor's current state (last run, TLS grade, breach date,
 * attestation expiry), a "Run monitor now" trigger, and the posture timeline:
 * the full history of monitored signals (breaches, cert expiries, TLS grades,
 * triggered reassessments) — the continuous-assurance record, not just the
 * latest questionnaire.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format-date';

interface Monitor {
    enabled: boolean;
    checkAttestation: boolean;
    checkBreach: boolean;
    checkTls: boolean;
    materializeFindings: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    breachLastSeenAt: string | null;
    breachCount: number;
    tlsGrade: string | null;
    tlsCheckedAt: string | null;
    attestationExpiresAt: string | null;
}
interface PostureEvent {
    id: string;
    eventType: string;
    severity: string;
    source: string;
    summary: string;
    occurredAt: string;
}
interface Posture {
    monitor: Monitor | null;
    events: PostureEvent[];
}

const SEVERITY_VARIANT: Record<string, StatusBadgeVariant> = {
    CRITICAL: 'error', HIGH: 'error', MEDIUM: 'warning', LOW: 'neutral', INFO: 'info',
};
const EVENT_LABELS: Record<string, string> = {
    BREACH_DETECTED: 'Breach detected',
    ATTESTATION_EXPIRED: 'Attestation expired',
    ATTESTATION_EXPIRING: 'Attestation expiring',
    TLS_GRADE: 'TLS grade',
    REASSESSMENT_TRIGGERED: 'Reassessment triggered',
    MONITOR_RUN: 'Monitor run',
    STATUS_CHANGED: 'Status changed',
};
const GRADE_VARIANT = (g: string | null): StatusBadgeVariant =>
    g == null ? 'neutral' : g === 'A' || g === 'B' ? 'success' : g === 'C' ? 'warning' : 'error';

function isExpired(d: string | null): boolean {
    return !!d && new Date(d).getTime() < Date.now();
}

export function VendorMonitoringPanel({
    tenantSlug,
    vendorId,
    canWrite,
    onChange,
}: {
    tenantSlug: string;
    vendorId: string;
    canWrite: boolean;
    onChange?: () => void;
}) {
    const t = useTranslations('vendors');
    const apiUrl = useCallback((p: string) => `/api/t/${tenantSlug}${p}`, [tenantSlug]);
    const [posture, setPosture] = useState<Posture | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/vendors/${vendorId}/monitor`));
            if (!res.ok) throw new Error(t('monitoring.loadFailed'));
            setPosture(await res.json());
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('monitoring.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [apiUrl, vendorId, t]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    const runNow = async () => {
        setRunning(true);
        try {
            const res = await fetch(apiUrl(`/vendors/${vendorId}/monitor/run`), { method: 'POST' });
            if (!res.ok) throw new Error(t('monitoring.runFailed'));
            await load();
            onChange?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('monitoring.runFailed'));
        } finally {
            setRunning(false);
        }
    };

    if (loading) {
        return <div className={cn(cardVariants(), 'text-sm text-content-muted')}>{t('monitoring.loading')}</div>;
    }
    if (error) {
        return <div className={cn(cardVariants(), 'text-sm text-content-danger')}>{error}</div>;
    }

    const m = posture?.monitor;
    const events = posture?.events ?? [];

    return (
        <div className="space-y-section">
            {/* Monitor state card */}
            <div className={cn(cardVariants(), 'space-y-default')}>
                <div className="flex items-center justify-between">
                    <Heading level={3}>{t('monitoring.title')}</Heading>
                    {canWrite && (
                        <Button variant="secondary" onClick={runNow} disabled={running} id="run-vendor-monitor-btn">
                            {running ? t('monitoring.running') : t('monitoring.runNow')}
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-default text-sm md:grid-cols-4">
                    <div>
                        <div className="text-content-muted">{t('monitoring.status')}</div>
                        <StatusBadge variant={m?.enabled ? 'success' : 'neutral'}>{m?.enabled ? t('monitoring.enabled') : t('monitoring.off')}</StatusBadge>
                    </div>
                    <div>
                        <div className="text-content-muted">{t('monitoring.tlsGrade')}</div>
                        <StatusBadge variant={GRADE_VARIANT(m?.tlsGrade ?? null)}>{m?.tlsGrade ?? '—'}</StatusBadge>
                    </div>
                    <div>
                        <div className="text-content-muted">{t('monitoring.breachLastSeen')}</div>
                        <div className={cn('mt-1', m?.breachLastSeenAt && 'text-content-danger')}>
                            {m?.breachLastSeenAt ? formatDateTime(m.breachLastSeenAt) : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="text-content-muted">{t('monitoring.attestationExpires')}</div>
                        <div className={cn('mt-1', isExpired(m?.attestationExpiresAt ?? null) && 'text-content-danger')}>
                            {m?.attestationExpiresAt ? formatDateTime(m.attestationExpiresAt) : '—'}
                            {isExpired(m?.attestationExpiresAt ?? null) && ` (${t('monitoring.expired')})`}
                        </div>
                    </div>
                </div>
                <div className="text-xs text-content-muted">
                    {m?.lastRunAt ? t('monitoring.lastRun', { date: formatDateTime(m.lastRunAt) }) : t('monitoring.neverRun')}
                    {' · '}{t('monitoring.monitorsLabel')}: {[m?.checkAttestation && t('monitoring.monAttestation'), m?.checkBreach && t('monitoring.monBreach'), m?.checkTls && t('monitoring.monTls')].filter(Boolean).join(', ') || t('monitoring.monNone')}
                    {m?.materializeFindings ? ` · ${t('monitoring.autoFindings')}` : ''}
                </div>
            </div>

            {/* Posture timeline */}
            <div className={cn(cardVariants(), 'space-y-default')}>
                <Heading level={3}>{t('monitoring.timelineTitle')}</Heading>
                {events.length === 0 ? (
                    <InlineEmptyState title={t('monitoring.timelineEmpty')} />
                ) : (
                    <ol className="space-y-tight">
                        {events.map((e) => (
                            <li key={e.id} className="flex items-start gap-default border-b border-border-subtle pb-2 text-sm last:border-0">
                                <StatusBadge variant={SEVERITY_VARIANT[e.severity] ?? 'neutral'}>
                                    {EVENT_LABELS[e.eventType] ?? e.eventType}
                                </StatusBadge>
                                <div className="flex-1">
                                    <div>{e.summary}</div>
                                    <div className="text-xs text-content-muted">
                                        {formatDateTime(e.occurredAt)} · {e.source}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
