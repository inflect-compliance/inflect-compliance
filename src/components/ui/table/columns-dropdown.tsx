"use client";

/**
 * ColumnsDropdown — state-based column visibility toggle.
 *
 * Sibling of `EditColumnsButton`. Where `EditColumnsButton` needs a live
 * TanStack `Table<T>` instance (and therefore has to sit inside the table
 * component tree), this variant is driven by the *controlled* visibility
 * state + a column config. That means page authors can mount it in the
 * toolbar, above the table — exactly where users expect to see "edit
 * columns" in an enterprise list UX.
 *
 * Usage:
 *
 *   const { columnVisibility, setColumnVisibility } = useColumnVisibility(
 *     'my-table',
 *     { all: ['code','name','status'], defaultVisible: ['code','name'] }
 *   );
 *
 *   <ColumnsDropdown
 *     columns={[
 *       { id: 'code',   label: 'Code' },
 *       { id: 'name',   label: 'Name' },
 *       { id: 'status', label: 'Status' },
 *     ]}
 *     visibility={columnVisibility}
 *     onChange={setColumnVisibility}
 *     defaultVisibility={{ code: true, name: true, status: true }}
 *   />
 */

import { Command } from "cmdk";
import { RotateCcw, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { VisibilityState } from "@tanstack/react-table";
import { Button } from "../button";
import { Popover } from "../popover";
import { ScrollContainer } from "../scroll-container";
import { Tooltip } from "../tooltip";
import { cn } from "./table-utils";

export interface ColumnsDropdownColumn {
    /** Column id — matches a key in the `visibility` state. */
    id: string;
    /** Human-readable label shown in the toggle list. */
    label: string;
    /** Column may not be hidden — always on, rendered without a toggle. */
    alwaysVisible?: boolean;
}

export interface ColumnsDropdownProps {
    /** Declarative column list (id + label). */
    columns: ColumnsDropdownColumn[];
    /** Current visibility state (typically from `useColumnVisibility`). */
    visibility: VisibilityState;
    /** Commit a new visibility state. */
    onChange: (next: VisibilityState) => void;
    /**
     * Visibility to apply when the user taps "Reset to defaults". Omit to
     * hide the reset row.
     */
    defaultVisibility?: VisibilityState;
    /** Button className override. */
    className?: string;
    /** Stable id for E2E / automation. */
    id?: string;
}

export function ColumnsDropdown({
    columns,
    visibility,
    onChange,
    defaultVisibility,
    className,
    id = "columns-dropdown",
}: ColumnsDropdownProps) {
    const [open, setOpen] = useState(false);

    const hideable = useMemo(
        () => columns.filter((c) => !c.alwaysVisible),
        [columns],
    );

    // A column is "hidden from default" if its current visibility differs
    // from the default — used to surface the reset row + a visual hint.
    const someHidden = useMemo(() => {
        if (!defaultVisibility) return false;
        for (const col of hideable) {
            const current = visibility[col.id] ?? defaultVisibility[col.id] ?? true;
            const defaultVal = defaultVisibility[col.id] ?? true;
            if (current !== defaultVal) return true;
        }
        return false;
    }, [visibility, defaultVisibility, hideable]);

    const toggle = (id: string) => {
        const current = visibility[id] ?? true;
        onChange({ ...visibility, [id]: !current });
    };

    const reset = () => {
        if (defaultVisibility) onChange({ ...defaultVisibility });
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
                        <Command.List className="flex w-screen flex-col gap-0.5 p-1 text-sm focus-visible:outline-none sm:w-auto sm:min-w-[180px]">
                            {hideable.map((col) => {
                                const isVisible = visibility[col.id] ?? true;
                                return (
                                    <Command.Item
                                        key={col.id}
                                        className={cn(
                                            "flex cursor-pointer select-none items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5",
                                            "text-content-default hover:text-content-emphasis",
                                            "data-[selected=true]:bg-bg-muted",
                                        )}
                                        onSelect={() => toggle(col.id)}
                                        data-testid={`column-toggle-${col.id}`}
                                    >
                                        <div
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                                isVisible
                                                    ? "border-[var(--brand-default)] bg-[var(--brand-emphasis)] text-white"
                                                    : "border-border-default bg-transparent",
                                            )}
                                        >
                                            {isVisible && (
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
                                        <span className="truncate">{col.label}</span>
                                    </Command.Item>
                                );
                            })}

                            {defaultVisibility && someHidden && (
                                <>
                                    <div className="my-1 h-px bg-border-subtle" />
                                    <Command.Item
                                        className={cn(
                                            "flex cursor-pointer select-none items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5",
                                            "text-content-muted hover:text-content-default",
                                            "data-[selected=true]:bg-bg-muted",
                                        )}
                                        onSelect={reset}
                                        data-testid="columns-reset"
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
            <Tooltip content="Edit columns">
                {/* R24-PR-E — icon-button shape locked. Square 36×36
                    (`size-9 p-0`) + the slim 8px radius the rest of
                    the chrome family wears (R24-PR-C). The historic
                    `rounded-lg` here was a 12px outlier — the gear
                    sat next to the filter dropdown (which inherited
                    the cva 8px) and the size disagreement read as
                    "two different button systems" in toolbars. The
                    `aria-pressed` cue + brand-tinted ring on the
                    "some hidden" state stays. */}
                <Button
                    type="button"
                    className={cn(
                        "size-9 shrink-0 whitespace-nowrap rounded-[8px] p-0",
                        someHidden && "ring-1 ring-[var(--brand-default)]/30",
                        className,
                    )}
                    variant="secondary"
                    icon={<Settings className="h-4 w-4 shrink-0" />}
                    aria-label="Edit columns"
                    data-testid="edit-columns-button"
                    id={id}
                />
            </Tooltip>
        </Popover>
    );
}
