'use client';

/**
 * ChecklistGearButton — the shared gear-popover checklist primitive
 * (2026-06-07).
 *
 * Both toolbar gears render through this ONE component: the "Edit filter
 * cards" gear (icon `Settings`, via `EditFiltersButton`) and the "Toggle
 * columns" gear (icon `Columns3`, via `EditColumnsButton`). The checklist
 * row recipe, the numbered click-to-order badges, the cmdk keyboard nav,
 * the scroll container, the ring indicator, and the reset row all live
 * here — zero duplication. The two wrappers only bind their domain icon /
 * title / test-id and map their definitions into `items`.
 *
 * Ordering is the click-to-order model from `checklist-order.ts`: visible
 * rows carry a 1-based number badge (their left-to-right position); hidden
 * rows sort below with no number. Selecting a row calls `onToggle(id)` —
 * the owning hook appends/removes the id and renumbers.
 *
 * The trigger is deliberately NOT wrapped in `<Tooltip>` — that swallows
 * Radix `Popover.Trigger.asChild`'s injected props (the old "gear doesn't
 * open" bug). `title` gives the hover hint; `aria-label` gives the SR name.
 * Locked by `edit-columns-no-tooltip-wrap` + `checklist-gear-primitive`.
 */
import { Command } from 'cmdk';
import { RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Popover } from './popover';
import { ScrollContainer } from './scroll-container';
import { cn } from '@/lib/cn';
import type { ChecklistGearItem } from './checklist-order';

export interface ChecklistGearButtonProps {
    /** Rows in DISPLAY order: visible (numbered) first, then hidden. */
    items: ChecklistGearItem[];
    /** Toggle a row's visibility (append/remove in the owning hook). */
    onToggle: (id: string) => void;
    /** Restore defaults. Omit to hide the reset row. */
    onReset?: () => void;
    /** Ring indicator — true when modified from default (hidden or reordered). */
    someModified: boolean;
    /** Hover hint + accessible name (e.g. "Edit filter cards"). */
    title: string;
    /** The gear icon — `Settings` (filters) or `Columns3` (columns). */
    icon: ReactNode;
    /** Stable id for E2E (e.g. "edit-filters-button"). */
    'data-testid': string;
    className?: string;
    id?: string;
}

export function ChecklistGearButton({
    items,
    onToggle,
    onReset,
    someModified,
    title,
    icon,
    'data-testid': testId,
    className,
    id,
}: ChecklistGearButtonProps) {
    const [open, setOpen] = useState(false);

    const reset = () => {
        onReset?.();
        setOpen(false);
    };

    return (
        <Popover
            openPopover={open}
            setOpenPopover={setOpen}
            align="end"
            content={
                <ScrollContainer className="max-h-[50vh]">
                    <Command tabIndex={0} loop>
                        <Command.List className="flex w-screen flex-col gap-0.5 p-1 text-sm focus-visible:outline-none sm:w-auto sm:min-w-[200px]">
                            {items.map((item) => (
                                <Command.Item
                                    key={item.id}
                                    // Explicit, stable value — without it cmdk
                                    // derives the value from the row's rendered
                                    // text, which INCLUDES the order-badge
                                    // number. When toggling changes a row's
                                    // number its derived value churns, leaving
                                    // some rows (e.g. a default-hidden one like
                                    // "Frequency") unselectable. The id is
                                    // stable + unique.
                                    value={item.id}
                                    className={cn(
                                        'flex cursor-pointer select-none items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5',
                                        'text-content-default hover:text-content-emphasis',
                                        'data-[selected=true]:bg-bg-muted',
                                    )}
                                    onSelect={() => onToggle(item.id)}
                                    data-testid={`checklist-toggle-${item.id}`}
                                >
                                    {/* Order badge — the 1-based position
                                        (= left-to-right order); blank when
                                        hidden. */}
                                    <span
                                        className={cn(
                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums',
                                            item.visible
                                                ? 'bg-[var(--brand-subtle)] text-[var(--brand-default)]'
                                                : 'text-content-subtle',
                                        )}
                                        data-testid={`checklist-order-${item.id}`}
                                    >
                                        {item.order ?? ''}
                                    </span>
                                    {/* Visibility checkbox */}
                                    <div
                                        className={cn(
                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                            item.visible
                                                ? 'border-[var(--brand-default)] bg-[var(--brand-emphasis)] text-content-inverted'
                                                : 'border-border-default bg-transparent',
                                        )}
                                    >
                                        {item.visible && (
                                            <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={3}
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                    {item.icon && (
                                        <span className="shrink-0 text-content-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
                                            {item.icon}
                                        </span>
                                    )}
                                    <span className="truncate">{item.label}</span>
                                </Command.Item>
                            ))}

                            {onReset && someModified && (
                                <>
                                    <div className="my-1 h-px bg-border-subtle" />
                                    <Command.Item
                                        className={cn(
                                            'flex cursor-pointer select-none items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5',
                                            'text-content-muted hover:text-content-default',
                                            'data-[selected=true]:bg-bg-muted',
                                        )}
                                        onSelect={reset}
                                        data-testid="checklist-reset"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                        <span>Reset to defaults</span>
                                    </Command.Item>
                                </>
                            )}
                        </Command.List>
                    </Command>
                </ScrollContainer>
            }
        >
            <Button
                type="button"
                className={cn(
                    'size-9 shrink-0 whitespace-nowrap rounded-[8px] p-0',
                    someModified && 'ring-1 ring-[var(--brand-default)]/30',
                    className,
                )}
                variant="secondary"
                icon={icon}
                title={title}
                aria-label={title}
                data-testid={testId}
                id={id}
            />
        </Popover>
    );
}
