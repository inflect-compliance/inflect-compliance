/**
 * ListPageShell — viewport-fit layout for list pages.
 *
 * Wraps the standard "page header + filter toolbar + table card +
 * pagination footer" arrangement so the table card fills the
 * remaining viewport height and only the table body scrolls — the
 * page header, filters, and pagination footer stay anchored.
 *
 * On mobile (<md) the shell is a no-op: it falls back to natural
 * document flow so touch scrolling behaves the way the user expects.
 *
 * Usage:
 *
 *   <ListPageShell>
 *     <ListPageShell.Header>
 *       <h1>Risks</h1>
 *       <p>{count} risks identified</p>
 *     </ListPageShell.Header>
 *     <ListPageShell.Filters>
 *       <FilterToolbar ... />
 *     </ListPageShell.Filters>
 *     <ListPageShell.Body>
 *       <DataTable fillBody data={...} columns={...} />
 *     </ListPageShell.Body>
 *   </ListPageShell>
 *
 * Slots are optional and order-independent — only `Body` should
 * carry the table that should fill remaining height.
 *
 * Layout invariants the shell guarantees on md+:
 *   • The shell itself is `flex-1 min-h-0` inside its parent (the
 *     AppShell inner content div). It fills the available height.
 *   • Body is `flex-1 min-h-0 overflow-hidden` so its content
 *     (typically `<DataTable fillBody>`) provides its own internal
 *     scroll without the body itself scrolling.
 *   • Header, Filters, Footer are `flex-shrink-0` so they keep
 *     their natural height — the body shrinks to fill the rest.
 *
 * Why slots and not just children: future-proofing for sticky-on-
 * scroll states (e.g. "show subtitle only when scrolled into table
 * body") and for the Phase 3 ratchet that will check that pages
 * use the shell. Open to dropping the slots if they remain unused
 * after a release.
 */
import { ReactNode } from 'react';
import { cn } from '@dub/utils';

export interface ListPageShellProps {
    children: ReactNode;
    className?: string;
}

function ListPageShellRoot({ children, className }: ListPageShellProps) {
    return (
        <div
            className={cn(
                // Mobile: natural document flow, no flex constraints.
                // Desktop: flex column that fills its parent and lets
                // children flex-1 to claim remaining height.
                'flex flex-col gap-default',
                'md:flex-1 md:min-h-0',
                className,
            )}
            data-list-page-shell="true"
        >
            {children}
        </div>
    );
}

function ListPageShellHeader({ children, className }: ListPageShellProps) {
    return (
        <header className={cn('flex-shrink-0', className)}>
            {children}
        </header>
    );
}

function ListPageShellFilters({ children, className }: ListPageShellProps) {
    return (
        <div className={cn('flex-shrink-0', className)}>
            {children}
        </div>
    );
}

function ListPageShellBody({ children, className }: ListPageShellProps) {
    return (
        <div
            className={cn(
                // Mobile: natural height. Desktop: fill remaining
                // space, hide own overflow so the inner DataTable
                // owns the scroll context.
                'md:flex-1 md:min-h-0 md:flex md:flex-col md:overflow-hidden',
                className,
            )}
            // Marker for DataTable's whole-row clip useEffect: it
            // walks up to find this element and uses ITS clientHeight
            // as the viewport allocation (since the card itself no
            // longer has flex-1, its own clientHeight == content
            // height, not available height).
            data-list-page-body="true"
        >
            {children}
        </div>
    );
}

function ListPageShellFooter({ children, className }: ListPageShellProps) {
    return (
        <footer className={cn('flex-shrink-0', className)}>
            {children}
        </footer>
    );
}

export const ListPageShell = Object.assign(ListPageShellRoot, {
    Header: ListPageShellHeader,
    Filters: ListPageShellFilters,
    Body: ListPageShellBody,
    Footer: ListPageShellFooter,
});
