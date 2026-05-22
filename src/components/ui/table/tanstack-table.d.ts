/**
 * Module augmentation for @tanstack/react-table — extends `ColumnMeta`
 * with the custom fields used by the DataTable / Table primitives.
 *
 * Placing this alongside the table source (not in a global `types/`)
 * keeps the augmentation co-located with the code that reads it, and
 * avoids polluting the global `ColumnMeta` shape for consumers that
 * never use these fields.
 */
import "@tanstack/react-table";

declare module "@tanstack/react-table" {
    interface ColumnMeta<TData, TValue> {
        /** When true, the cell text will NOT be clipped with a truncation ellipsis. */
        disableTruncate?: boolean;
        /** Optional tooltip text rendered next to the column header label. */
        headerTooltip?: string;
    }
}
