'use client';

/**
 * Epic 49 — Compliance Calendar client island.
 *
 * Three views: Heatmap (12 months back), Month (single month grid),
 * Gantt (12 months centred on today, audit-cycle/range-bearing
 * events only). View toggle drives both the rendered component AND
 * the query range (heatmap fetches 12 months back, Gantt fetches
 * a 12-month centred window, Month fetches just the visible month +
 * adjacent padding for the 6×7 grid).
 *
 * Selected day populates a side panel listing every event that day,
 * each linked to its entity detail page.
 */

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import Link from 'next/link';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/hooks/use-toast';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import { parseYMD, toYMD } from '@/components/ui/date-picker/date-utils';
import { CalendarHeatmap } from '@/components/ui/CalendarHeatmap';
import { CalendarMonth } from '@/components/ui/CalendarMonth';
import { GanttTimeline } from '@/components/ui/GanttTimeline';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { formatDate } from '@/lib/format-date';
import { NewTaskModal } from '@/app/t/[tenantSlug]/(app)/tasks/NewTaskModal';
import type {
    CalendarEvent,
    CalendarResponse,
} from '@/app-layer/schemas/calendar.schemas';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';

const DAY_MS = 86_400_000;

type View = 'heatmap' | 'month' | 'gantt';

interface CalendarClientProps {
    tenantSlug: string;
    initial: CalendarResponse;
    initialRange: { from: string; to: string };
}

function startOfUtcMonth(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfUtcMonth(d: Date): Date {
    return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
}

function rangeForView(view: View, monthCursor: Date): { from: Date; to: Date } {
    const today = new Date();
    if (view === 'heatmap') {
        return {
            from: new Date(today.getTime() - 365 * DAY_MS),
            to: today,
        };
    }
    if (view === 'gantt') {
        return {
            from: new Date(today.getTime() - 180 * DAY_MS),
            to: new Date(today.getTime() + 180 * DAY_MS),
        };
    }
    // month — pad to cover the 6-row grid
    const start = startOfUtcMonth(monthCursor);
    const end = endOfUtcMonth(monthCursor);
    return {
        from: new Date(start.getTime() - 7 * DAY_MS),
        to: new Date(end.getTime() + 7 * DAY_MS),
    };
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarClient({
    tenantSlug,
    initial,
    initialRange,
}: CalendarClientProps) {
    const t = useTranslations('calendar');
    const toast = useToast();
    const [view, setView] = React.useState<View>('month');
    const [monthCursor, setMonthCursor] = React.useState<Date>(
        () => startOfUtcMonth(new Date()),
    );
    const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
    // PR-C — double-click on a day cell opens the New Task modal
    // with that date pre-filled as the due date. `taskCreateDate`
    // is the YMD seeding the modal; `null` keeps the modal closed.
    const [taskCreateDate, setTaskCreateDate] = React.useState<string | null>(
        null,
    );

    // Pull `getTime()` into a stable primitive so the dep array is
    // statically checkable. We deliberately depend on `monthCursorMs`
    // rather than the live `monthCursor` Date instance — the lint
    // rule sees the missing `monthCursor` dep but the runtime is
    // stable because the timestamp captures the only field
    // `rangeForView` reads off the Date.
    const monthCursorMs = monthCursor.getTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const range = React.useMemo(() => rangeForView(view, monthCursor), [view, monthCursorMs]);

    const fromKey = range.from.toISOString();
    const toKey = range.to.toISOString();

    // Initial server-rendered range happens to overlap with the default
    // (month) view — feed that as initialData when the keys match.
    const initialMatches =
        initialRange.from === fromKey && initialRange.to === toKey;

    const calQuery = useTenantSWR<CalendarResponse>(
        CACHE_KEYS.calendar.range(fromKey, toKey),
        { fallbackData: initialMatches ? initial : undefined },
    );

    // Stabilise the array identity — the `?? []` produces a fresh
    // empty array each render, which destabilises the useMemos
    // below that depend on `events`.
    const events: CalendarEvent[] = React.useMemo(
        () => calQuery.data?.events ?? [],
        [calQuery.data],
    );

    // Per-source truncation report. Absent on a cached response from
    // before this shipped, hence the optional chain at the call site.
    const truncation = calQuery.data?.truncation;

    // Filter: Gantt only shows events that have a meaningful range OR
    // are audit cycles (where `start === end` may be intentional).
    const ganttEvents = React.useMemo(
        () =>
            events.filter(
                (e) => e.end !== undefined || e.category === 'audit',
            ),
        [events],
    );

    const selectedEvents = React.useMemo(() => {
        if (!selectedDate) return [];
        return events.filter((e) => e.date.slice(0, 10) === selectedDate);
    }, [events, selectedDate]);

    const handlePrev = () => {
        if (view !== 'month') return;
        setMonthCursor(
            (prev) =>
                new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)),
        );
    };
    const handleNext = () => {
        if (view !== 'month') return;
        setMonthCursor(
            (prev) =>
                new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)),
        );
    };

    // ─── PR-3.7 — actionable side panel for task-backed events ───
    //
    // The day panel used to be navigate-only. For calendar events that
    // are backed by a TASK, we surface Complete + Reschedule inline so a
    // user can act on a deadline without leaving the calendar. Non-task
    // events (audit cycles, evidence reviews, …) stay read-only — they
    // carry no writable due date here. Both mutations go through the
    // canonical task endpoints (status → setTaskStatus so the state
    // machine + TP-3 reconciliation apply; PATCH for the due date), then
    // revalidate the visible range so the grid reflects the change.
    const apiBase = `/api/t/${tenantSlug}`;
    const [busyEventId, setBusyEventId] = React.useState<string | null>(null);
    const [rescheduleEventId, setRescheduleEventId] = React.useState<
        string | null
    >(null);

    const optimisticPatch = React.useCallback(
        (eventId: string, patch: Partial<CalendarEvent>) =>
            calQuery.mutate(
                (curr) =>
                    curr
                        ? {
                              ...curr,
                              events: curr.events.map((e) =>
                                  e.id === eventId ? { ...e, ...patch } : e,
                              ),
                          }
                        : curr,
                { revalidate: false },
            ),
        [calQuery],
    );

    const completeTask = React.useCallback(
        async (ev: CalendarEvent) => {
            if (ev.entityType !== 'TASK') return;
            setBusyEventId(ev.id);
            // Optimistic — mute the event to `done` immediately.
            await optimisticPatch(ev.id, { status: 'done' });
            try {
                const res = await fetch(
                    `${apiBase}/tasks/${ev.entityId}/status`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status: 'CLOSED',
                            resolution: t('taskCompleteResolution'),
                        }),
                    },
                );
                if (!res.ok) throw new Error('complete failed');
                toast.success(t('taskCompleted'));
            } catch {
                toast.error(t('taskActionError'));
            } finally {
                setBusyEventId(null);
                // Reconcile with the server (rolls back the optimistic
                // patch on failure, confirms it on success).
                await calQuery.mutate();
            }
        },
        [apiBase, calQuery, optimisticPatch, t, toast],
    );

    const rescheduleTask = React.useCallback(
        async (ev: CalendarEvent, ymd: string) => {
            if (ev.entityType !== 'TASK') return;
            setBusyEventId(ev.id);
            setRescheduleEventId(null);
            await optimisticPatch(ev.id, { date: ymd });
            try {
                const res = await fetch(`${apiBase}/tasks/${ev.entityId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dueAt: ymd }),
                });
                if (!res.ok) throw new Error('reschedule failed');
                toast.success(t('taskRescheduled'));
            } catch {
                toast.error(t('taskActionError'));
            } finally {
                setBusyEventId(null);
                await calQuery.mutate();
            }
        },
        [apiBase, calQuery, optimisticPatch, t, toast],
    );

    return (
        <div className="space-y-section animate-fadeIn">
            {/* Header */}
            <header className="flex items-start justify-between gap-default flex-wrap">
                <div className="min-w-0">
                    <PageBreadcrumbs
                        items={[
                            { label: t('crumbDashboard'), href: `/t/${tenantSlug}/dashboard` },
                            { label: t('crumbCalendar') },
                        ]}
                        className="mb-1"
                    />
                    <Heading level={1} className="sr-only flex items-center gap-tight">
                        <CalIcon className="size-6 text-content-muted" aria-hidden="true" />
                        {t('title')}
                    </Heading>
                    <p className="text-sm text-content-muted mt-1">
                        {t('description')}
                    </p>
                </div>
                <div className="flex items-center gap-tight flex-wrap">
                    <ToggleGroup
                        selected={view}
                        selectAction={(v) => setView(v as View)}
                        options={[
                            { value: 'month', label: t('viewMonth') },
                            { value: 'heatmap', label: t('viewHeatmap') },
                            { value: 'gantt', label: t('viewTimeline') },
                        ]}
                        size="sm"
                        ariaLabel={t('viewAria')}
                    />
                </div>
            </header>

            {/* Range navigation.
                Month view has working prev/next arrows. Heatmap (last
                12 months) and Gantt (12-month centred) use FIXED windows
                — P4.2 renders an explicit label in the same slot so the
                absence of arrows reads as intentional, not broken. We
                deliberately do NOT wire range-nav into those views. */}
            {view === 'month' ? (
                <div
                    className={cn(cardVariants({ density: 'none' }), 'flex items-center justify-between px-4 py-2')}
                    data-testid="calendar-month-nav"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handlePrev}
                        aria-label={t('prevMonth')}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span
                        className="text-sm font-semibold text-content-emphasis"
                        data-testid="calendar-current-month"
                    >
                        {MONTH_NAMES[monthCursor.getUTCMonth()]}{' '}
                        {monthCursor.getUTCFullYear()}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleNext}
                        aria-label={t('nextMonth')}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            ) : (
                <div
                    className={cn(cardVariants({ density: 'none' }), 'flex items-center justify-center px-4 py-2')}
                    data-testid="calendar-fixed-window-label"
                >
                    <span className="text-sm font-medium text-content-muted">
                        {view === 'heatmap'
                            ? t('heatmapWindowLabel')
                            : t('ganttWindowLabel')}
                    </span>
                </div>
            )}

            {/* Loading + error states */}
            {calQuery.error && (
                <div className="rounded-lg border border-border-error bg-bg-error px-4 py-3 text-sm text-content-error">
                    {t('loadError')}
                </div>
            )}

            {/* Truncation notice. Each source is capped per request; because
                every loader now orders by its date column ascending, what
                survives a cap is the NEAREST deadlines — but the rest are
                real and the page must not imply this range is complete. */}
            {truncation?.capped && (
                <div
                    className="rounded-lg border border-border-warning bg-bg-warning px-4 py-3 text-sm text-content-warning"
                    role="status"
                    data-testid="calendar-truncation-notice"
                >
                    {t('truncationNotice', {
                        limit: truncation.perSourceLimit,
                        sources: truncation.sources.join(', '),
                    })}
                </div>
            )}

            {/* Body — view switch */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-section">
                <div className={cardVariants({ density: 'compact' })}>
                    {/* The calendar/heatmap/timeline always renders — even
                        with zero events — so an empty month still shows its
                        full grid (no "No deadlines in this range" takeover).
                        Each view handles the empty case itself (empty cells /
                        empty heatmap / the timeline's own empty message). */}
                    {view === 'heatmap' ? (
                        <CalendarHeatmap
                            events={events}
                            from={range.from}
                            to={range.to}
                            onSelectDate={setSelectedDate}
                        />
                    ) : view === 'month' ? (
                        <CalendarMonth
                            month={monthCursor}
                            events={events}
                            onSelectDate={setSelectedDate}
                            // PR-C — double-click → New Task modal
                            // seeded with the clicked day's date.
                            onDoubleClickDate={(ymd) => {
                                setSelectedDate(ymd);
                                setTaskCreateDate(ymd);
                            }}
                            selectedYmd={selectedDate}
                        />
                    ) : (
                        <GanttTimeline
                            from={range.from}
                            to={range.to}
                            events={ganttEvents}
                            emptyMessage={t('ganttEmpty')}
                        />
                    )}
                </div>

                {/* Side panel — selected day's events */}
                <aside
                    className={cardVariants({ density: 'compact' })}
                    data-testid="calendar-side-panel"
                >
                    {selectedDate ? (
                        <>
                            <Heading level={3} className="mb-2">
                                {formatDate(new Date(selectedDate))}
                            </Heading>
                            {selectedEvents.length === 0 ? (
                                <p className="text-xs text-content-muted">
                                    {t('eventsEmptyDay')}
                                </p>
                            ) : (
                                <ul className="space-y-tight">
                                    {selectedEvents.map((ev) => {
                                        const isTask = ev.entityType === 'TASK';
                                        const busy = busyEventId === ev.id;
                                        return (
                                        <li
                                            key={ev.id}
                                            data-event-id={ev.id}
                                        >
                                            <Link
                                                href={ev.href}
                                                className="block rounded p-2 text-xs hover:bg-bg-muted transition-colors"
                                            >
                                                <div className="font-medium text-content-emphasis truncate">
                                                    {ev.title}
                                                </div>
                                                {ev.detail && (
                                                    <div className="text-content-muted truncate">
                                                        {ev.detail}
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-content-subtle uppercase tracking-wider mt-0.5">
                                                    {ev.category} · {ev.status}
                                                </div>
                                            </Link>
                                            {/* PR-3.7 — inline actions for
                                                task-backed events only. */}
                                            {isTask && (
                                                <div className="mt-1 px-2 pb-1">
                                                    {rescheduleEventId === ev.id ? (
                                                        <DatePicker
                                                            clearable={false}
                                                            align="start"
                                                            value={parseYMD(ev.date.slice(0, 10))}
                                                            onChange={(next) => {
                                                                const ymd = toYMD(next);
                                                                if (ymd) void rescheduleTask(ev, ymd);
                                                                else setRescheduleEventId(null);
                                                            }}
                                                            aria-label={t('rescheduleAria')}
                                                        />
                                                    ) : (
                                                        <div className="flex items-center gap-tight">
                                                            {ev.status !== 'done' && (
                                                                <Button
                                                                    type="button"
                                                                    variant="secondary"
                                                                    size="xs"
                                                                    disabled={busy}
                                                                    onClick={() => void completeTask(ev)}
                                                                >
                                                                    {t('completeAction')}
                                                                </Button>
                                                            )}
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="xs"
                                                                disabled={busy}
                                                                onClick={() => setRescheduleEventId(ev.id)}
                                                            >
                                                                {t('rescheduleAction')}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-content-muted">
                            {t('clickDay')}
                        </p>
                    )}
                </aside>
            </div>

            {/* PR-C — New Task modal driven by calendar double-click.
                Mounted unconditionally; the `open` prop controls
                visibility. `initialDueAt` seeds the form's dueAt
                field with the YMD of the clicked day. After create,
                we stay on the calendar (the SWR revalidation
                surfaces the new task immediately on the affected
                day cell). */}
            <NewTaskModal
                open={taskCreateDate !== null}
                setOpen={(next) => {
                    const open =
                        typeof next === 'function'
                            ? next(taskCreateDate !== null)
                            : next;
                    if (!open) setTaskCreateDate(null);
                }}
                initialDueAt={taskCreateDate ?? undefined}
                onCreated={() => {
                    setTaskCreateDate(null);
                    // Revalidate the currently-visible range; switching views
                    // refetches its own range key on demand.
                    calQuery.mutate();
                }}
            />
        </div>
    );
}
