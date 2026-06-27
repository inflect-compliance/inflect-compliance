'use client';

/**
 * ORG_INITIATIVES widget — portfolio security-programme tracker.
 *
 * Concept ported from Cybether (MIT). Shows the top-N in-flight
 * initiatives as ProgressCard rows (title, status, owner, target, progress
 * bar, linked-work count + tenant span), with a board-level "N in flight,
 * M at risk" headline. At-risk rows (BLOCKED or past-due) get a warning
 * tone; stale rows (IN_PROGRESS, no update in 30 days) get a muted flag.
 */
import Link from 'next/link';
import { Rocket, AlertTriangle } from 'lucide-react';

import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatDate } from '@/lib/format-date';
import type { InitiativeWidgetData } from '@/app-layer/usecases/org-security-initiative';

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'error' | 'success'> = {
    PLANNED: 'neutral',
    IN_PROGRESS: 'info',
    BLOCKED: 'error',
    COMPLETED: 'success',
    CANCELLED: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
    PLANNED: 'Planned',
    IN_PROGRESS: 'In progress',
    BLOCKED: 'Blocked',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};

export function OrgInitiativesWidget({ data, orgSlug }: { data: InitiativeWidgetData; orgSlug: string }) {
    return (
        <div className="flex h-full flex-col gap-tight rounded-lg bg-bg-subtle p-4" data-testid="org-initiatives-widget">
            <div className="flex items-center justify-between gap-compact flex-wrap">
                <div className="flex items-center gap-compact">
                    <Rocket className="w-5 h-5 text-content-muted" aria-hidden="true" />
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-content-muted">Security initiatives</p>
                        <p className="text-sm font-medium">
                            {data.inFlight} in flight
                            {data.atRisk > 0 && (
                                <span className="text-content-warning"> · {data.atRisk} at risk</span>
                            )}
                        </p>
                    </div>
                </div>
                <Link href={`/org/${orgSlug}/initiatives`} className="text-xs text-content-info underline hover:text-content-default">
                    View all
                </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-tight">
                {data.rows.length === 0 && (
                    <p className="text-sm text-content-muted">No initiatives in flight.</p>
                )}
                {data.rows.map((r) => (
                    <Link
                        key={r.id}
                        href={`/org/${orgSlug}/initiatives/${r.id}`}
                        className={
                            'block rounded-lg border p-3 space-y-tight transition-colors ' +
                            (r.atRisk ? 'border-border-warning bg-bg-warning/30' : 'border-border-subtle hover:border-border-default')
                        }
                        data-testid={`org-initiative-row-${r.id}`}
                    >
                        <div className="flex items-center justify-between gap-tight flex-wrap">
                            <span className="text-sm font-medium flex items-center gap-tight">
                                {r.atRisk && <AlertTriangle className="w-3.5 h-3.5 text-content-warning" aria-hidden="true" />}
                                {r.title}
                            </span>
                            <StatusBadge variant={STATUS_VARIANT[r.status] ?? 'neutral'} size="sm">
                                {STATUS_LABEL[r.status] ?? r.status}
                            </StatusBadge>
                        </div>
                        <ProgressBar
                            value={r.progress.percent}
                            aria-label={`${r.title} progress`}
                            variant={r.atRisk ? 'warning' : undefined}
                        />
                        <div className="flex items-center gap-tight flex-wrap text-xs text-content-muted">
                            <span>{r.progress.percent}%{r.progress.manual ? ' (manual)' : ''}</span>
                            <span>· {r.linkCount} linked{r.tenantSpan > 0 ? ` across ${r.tenantSpan} tenant${r.tenantSpan === 1 ? '' : 's'}` : ''}</span>
                            {r.targetDate && <span>· due {formatDate(new Date(r.targetDate))}</span>}
                            {r.stale && (
                                <span className="italic" data-testid="org-initiative-stale">· no recent activity</span>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
