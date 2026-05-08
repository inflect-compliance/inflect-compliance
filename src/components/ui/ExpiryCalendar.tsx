/**
 * ExpiryCalendar — Evidence expiry timeline widget.
 *
 * Shows upcoming evidence expirations as a compact, scannable list
 * grouped by urgency (overdue / this week / this month).
 *
 * Design:
 *   - Color-coded urgency bands (red/amber/yellow)
 *   - Days-remaining badge for quick scanning
 *   - Truncated titles with full title on hover
 *   - Empty state when no upcoming expirations
 *
 * @example
 * ```tsx
 * <ExpiryCalendar
 *     items={[
 *         { id: '1', title: 'SOC2 Evidence', nextReviewDate: '2026-04-20', status: 'SUBMITTED', daysUntil: 2 },
 *     ]}
 * />
 * ```
 */

import { formatDateCompact } from '@/lib/format-date';

// ─── Props ──────────────────────────────────────────────────────────

export interface ExpiryItem {
    id: string;
    title: string;
    /** YYYY-MM-DD */
    nextReviewDate: string;
    status: string;
    /** Days until expiry (negative = overdue) */
    daysUntil: number;
}

export interface ExpiryCalendarProps {
    /** Evidence items with upcoming expiry */
    items: ExpiryItem[];
    /** Optional CSS class */
    className?: string;
    /** Optional test-id */
    id?: string;
}

// ─── Urgency Helpers ────────────────────────────────────────────────

type Urgency = 'overdue' | 'urgent' | 'upcoming' | 'normal';

function getUrgency(daysUntil: number): Urgency {
    if (daysUntil < 0) return 'overdue';
    if (daysUntil <= 7) return 'urgent';
    if (daysUntil <= 14) return 'upcoming';
    return 'normal';
}

function urgencyConfig(u: Urgency) {
    switch (u) {
        case 'overdue':  return { color: 'text-content-error', bg: 'bg-bg-error', badge: 'bg-bg-error text-content-error', label: 'Overdue' };
        case 'urgent':   return { color: 'text-content-warning', bg: 'bg-bg-warning', badge: 'bg-bg-warning text-content-warning', label: 'This Week' };
        case 'upcoming': return { color: 'text-content-warning', bg: 'bg-bg-warning', badge: 'bg-bg-warning text-content-warning', label: 'Next Week' };
        case 'normal':   return { color: 'text-content-muted', bg: 'bg-bg-subtle', badge: 'bg-bg-subtle text-content-default', label: 'This Month' };
    }
}

function formatDaysUntil(days: number): string {
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days}d`;
}

// Epic 58 — delegate to the canonical `formatDateCompact` so the
// widget's day label ("16 Apr") reads identically to chart axes and
// mini calendars elsewhere in the app.
function formatDate(iso: string): string {
    return formatDateCompact(iso + 'T00:00:00Z');
}

// ─── Component ──────────────────────────────────────────────────────

export default function ExpiryCalendar({
    items,
    className = '',
    id,
}: ExpiryCalendarProps) {
    // Empty state
    if (!items || items.length === 0) {
        return (
            <div id={id} className={`glass-card p-5 ${className}`}>
                <h3 className="text-sm font-semibold text-content-default mb-3">Evidence Expiry</h3>
                <p className="text-xs text-content-subtle">No upcoming evidence expirations.</p>
            </div>
        );
    }

    // Group by urgency
    const groups = new Map<Urgency, ExpiryItem[]>();
    for (const item of items) {
        const u = getUrgency(item.daysUntil);
        const existing = groups.get(u) ?? [];
        existing.push(item);
        groups.set(u, existing);
    }

    const orderedGroups: Urgency[] = ['overdue', 'urgent', 'upcoming', 'normal'];

    return (
        <div id={id} className={`glass-card p-5 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-content-default">Evidence Expiry</h3>
                <span className="text-xs text-content-subtle tabular-nums">{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-3 max-h-[280px] overflow-y-auto">
                {orderedGroups.map((urgency) => {
                    const groupItems = groups.get(urgency);
                    if (!groupItems || groupItems.length === 0) return null;
                    const config = urgencyConfig(urgency);

                    return (
                        <div key={urgency}>
                            {/* Group header */}
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${config.color}`}>
                                    {config.label}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.badge} tabular-nums`}>
                                    {groupItems.length}
                                </span>
                            </div>

                            {/* Items */}
                            <div className="space-y-1">
                                {groupItems.map((item) => {
                                    const itemConfig = urgencyConfig(getUrgency(item.daysUntil));
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg ${itemConfig.bg}`}
                                            title={`${item.title} — due ${item.nextReviewDate} (${formatDaysUntil(item.daysUntil)})`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span className="text-xs text-content-default truncate">{item.title}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] text-content-subtle">{formatDate(item.nextReviewDate)}</span>
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${itemConfig.badge} tabular-nums`}>
                                                    {formatDaysUntil(item.daysUntil)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
