'use client';

/**
 * R10-PR6 — `useColumnsDropdown`: the single contract for mounting a
 * column-visibility gear above a DataTable.
 *
 * Before R10-PR6 every consumer of `<ColumnsDropdown>` repeated the
 * same ~25 lines: declare a `ColumnVisibilityConfig`, call
 * `useColumnVisibility(storageKey, config)`, compute defaults via
 * `getDefaultVisibility`, declare a *separate* `[{id,label}]` array
 * for the dropdown, then plumb all four into the DataTable + filter
 * toolbar. The column list was duplicated — string ids in `config.all`,
 * `{id,label}` records in the dropdown array — and the two had to
 * stay in sync by hand.
 *
 * This hook collapses the dance into one call:
 *
 *   const { columnVisibility, setColumnVisibility, dropdown } =
 *     useColumnsDropdown({
 *       storageKey: 'inflect:col-vis:risks',
 *       columns: [
 *         { id: 'title',  label: 'Title' },
 *         { id: 'asset',  label: 'Asset' },
 *         { id: 'status', label: 'Status', defaultVisible: false },
 *       ],
 *     });
 *
 *   <DataTable
 *     columnVisibility={columnVisibility}
 *     onColumnVisibilityChange={setColumnVisibility}
 *     ...
 *   />
 *   <FilterToolbar actions={dropdown} />
 *
 * Single source of truth for the column list. localStorage-persisted
 * via the existing `useColumnVisibility` infrastructure (no new
 * persistence layer). Reset-to-defaults works because we precompute
 * the defaults from the same column list.
 *
 * Returns the dropdown as a `ReactNode` (not a JSX function) so call
 * sites can drop it directly into a slot prop. That's an intentional
 * deviation from the "hooks return state, components render JSX"
 * convention — the cost of a separate component would be to re-thread
 * the same column list through props at every consumer.
 */

import { useMemo, type ReactNode } from 'react';
import type { VisibilityState } from '@tanstack/react-table';
import { ColumnsDropdown } from './columns-dropdown';
import { useColumnVisibility } from '../hooks/use-column-visibility';
import { getDefaultVisibility } from './column-visibility-utils';

export interface ColumnDropdownColumn {
    /** TanStack column id — must match the DataTable column def's `id`. */
    id: string;
    /** Human-readable label shown in the dropdown checklist. */
    label: string;
    /**
     * Whether the column is visible by default. Omitted = `true`.
     * Use `false` for columns that should be opt-in (e.g. dense
     * detail columns the user can toggle on but doesn't need by
     * default).
     */
    defaultVisible?: boolean;
    /**
     * Always-visible columns can't be toggled off (e.g. the actions
     * column, the row-select column). Omitted = togglable.
     */
    alwaysVisible?: boolean;
}

export interface UseColumnsDropdownOptions {
    /**
     * localStorage key for the visibility state. Convention:
     * `'inflect:col-vis:<entity>'` (e.g. `'inflect:col-vis:risks'`).
     * The key persists per-user-per-browser; users get the column set
     * they last chose when they revisit the page.
     */
    storageKey: string;
    /**
     * The full column list, in the order they should appear in the
     * dropdown checklist. Order doesn't have to match the DataTable's
     * column order — but it usually does.
     */
    columns: ColumnDropdownColumn[];
}

export interface UseColumnsDropdownResult {
    /** Pass to `<DataTable columnVisibility={…}>`. */
    columnVisibility: VisibilityState;
    /** Pass to `<DataTable onColumnVisibilityChange={…}>`. */
    setColumnVisibility: (visibility: VisibilityState) => void;
    /**
     * Pre-rendered dropdown — drop directly into
     * `<FilterToolbar actions={dropdown}>` (or
     * `<EntityListPage filters={{ toolbarActions: dropdown }}>`).
     */
    dropdown: ReactNode;
    /**
     * The default visibility map. Rarely needed externally — the
     * dropdown's "Reset to defaults" action already uses it.
     */
    defaults: VisibilityState;
}

export function useColumnsDropdown(
    options: UseColumnsDropdownOptions,
): UseColumnsDropdownResult {
    const { storageKey, columns } = options;

    // Derive the underlying `ColumnVisibilityConfig` once per column-
    // list change. The `all` and `defaultVisible` arrays are
    // computed from the same source so they can never diverge.
    const config = useMemo(
        () => ({
            all: columns.map((c) => c.id),
            defaultVisible: columns
                .filter((c) => c.defaultVisible !== false)
                .map((c) => c.id),
            fixed: columns
                .filter((c) => c.alwaysVisible === true)
                .map((c) => c.id),
        }),
        [columns],
    );

    const { columnVisibility, setColumnVisibility } = useColumnVisibility(
        storageKey,
        config,
    );

    const defaults = useMemo(() => getDefaultVisibility(config), [config]);

    // Bare `{ id, label }` projection for ColumnsDropdown — strip the
    // R10-PR6 metadata so the consumer-facing dropdown stays a thin
    // popover. `alwaysVisible: true` columns are excluded from the
    // checklist entirely (the user can't toggle them).
    const dropdownItems = useMemo(
        () =>
            columns
                .filter((c) => c.alwaysVisible !== true)
                .map((c) => ({ id: c.id, label: c.label })),
        [columns],
    );

    const dropdown = (
        <ColumnsDropdown
            columns={dropdownItems}
            visibility={columnVisibility}
            onChange={(v) => setColumnVisibility(v)}
            defaultVisibility={defaults}
        />
    );

    return { columnVisibility, setColumnVisibility, dropdown, defaults };
}
