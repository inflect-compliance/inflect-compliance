/* eslint-disable @typescript-eslint/no-explicit-any --
 * Generic type aliases over `TData`. The `any` defaults exist so
 * unspecialised consumers don't explode at type-check time; they
 * mirror tanstack-react-table's own default-generic strategy.
 */
import {
  Cell,
  ColumnDef,
  ColumnPinningState,
  ColumnResizeMode,
  PaginationState,
  Row,
  RowSelectionState,
  Table as TableType,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Dispatch,
  HTMLAttributes,
  MouseEvent,
  PropsWithChildren,
  ReactNode,
  SetStateAction,
} from "react";

type BaseTableProps<T> = {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  error?: string;
  emptyState?: ReactNode;
  resourceName?: (plural: boolean) => string;

  defaultColumn?: Partial<ColumnDef<T, any>>;
  columnPinning?: ColumnPinningState;
  cellRight?: (cell: Cell<T, any>) => ReactNode;

  // Sorting
  sortableColumns?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (props: {
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => void;

  // Column resizing
  enableColumnResizing?: boolean;
  columnResizeMode?: ColumnResizeMode;

  // Column visibility
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;

  // Row selection — R12-PR1 made the select column DEFAULT-ON. Pages
  // opt out by passing `selectionEnabled={false}` (rare: card-list
  // dashboards, single-row admin panels). Bulk actions still wire
  // through `selectionControls`; without them, the checkboxes just
  // toggle row state. Premium products (Linear, Stripe, Vercel)
  // always render the select column on row-record tables so the
  // selection affordance is at least visible.
  getRowId?: (row: T) => string;
  onRowSelectionChange?: (rows: Row<T>[]) => void;
  selectedRows?: RowSelectionState;
  selectionControls?: (table: TableType<T>) => ReactNode;
  /**
   * Opt out of the default-on select column. Pass `false` for tables
   * that are deliberately read-only at the row level (sub-component
   * sub-tables that the parent doesn't bulk-select, etc.).
   */
  selectionEnabled?: boolean;

  // Misc. row props
  onRowClick?: (row: Row<T>, e: MouseEvent) => void;
  onRowAuxClick?: (row: Row<T>, e: MouseEvent) => void;
  /**
   * Expandable rows. When `getRowCanExpand(row)` returns true the row shows a
   * leading chevron; toggling it renders `renderExpandedRow(row)` as a
   * full-width sub-row beneath it (the canonical tanstack expanding
   * sub-component). Default OFF — without `renderExpandedRow` no chevron
   * renders and behaviour is unchanged, so every existing table is unaffected.
   */
  getRowCanExpand?: (row: Row<T>) => boolean;
  renderExpandedRow?: (row: Row<T>) => ReactNode;
  rowProps?:
    | HTMLAttributes<HTMLTableRowElement>
    | ((row: Row<T>) => HTMLAttributes<HTMLTableRowElement>);

  // Table styles
  className?: string;
  containerClassName?: string;
  scrollWrapperClassName?: string;
  emptyWrapperClassName?: string;
  thClassName?: string | ((columnId: string) => string);
  tdClassName?: string | ((columnId: string, row: Row<T>) => string);
};

export type UseTableProps<T> = BaseTableProps<T> &
  (
    | {
        pagination?: PaginationState;
        onPaginationChange?: Dispatch<SetStateAction<PaginationState>>;
        rowCount: number;
      }
    | { pagination?: never; onPaginationChange?: never; rowCount?: never }
  );

export type TableProps<T> = BaseTableProps<T> &
  PropsWithChildren<{
    table: TableType<T>;
  }> &
  (
    | {
        pagination?: PaginationState;
        paginationAllRowsHref?: string;
        rowCount: number;
      }
    | { pagination?: never; paginationAllRowsHref?: never; rowCount?: never }
  );
