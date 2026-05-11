'use client';

/**
 * R13-PR1 — `<TableTitleCell>`: the canonical title-column cell.
 *
 * Pre-R13 every entity list page (Controls, Risks, Vendors, Tasks,
 * Assets, Evidence, Policies, Findings) rendered its title cell
 * with a slightly different shape:
 *
 *   Controls   <div><Link className="font-medium text-content-emphasis ...">{code}</Link>
 *   Risks      <span className="font-medium text-content-emphasis text-sm">{title}</span>
 *   Policies   <Link className="font-medium text-content-emphasis ...">{title}</Link>
 *   Evidence   <div className="flex items-center gap-tight min-w-0"><Icon /><Link>...
 *   Tasks      <div><Link>...</Link> + inline SLA badges
 *   Vendors    <div className="font-medium"><Link className={textLinkVariants}>...</Link> + sub-processor
 *   Assets     <span className="font-medium text-content-emphasis">{name}</span>
 *   Findings   <span className="font-medium text-content-emphasis text-sm">{title}</span>
 *
 * Eight pages, eight subtly-different shapes — and the user could
 * see the difference. R13-PR1 collapses them into ONE primitive.
 *
 * Contract:
 *   - Renders a single inline element so row height stays at the
 *     DataTable primitive's ~44px baseline (no block children).
 *   - `font-medium text-content-emphasis text-sm` — the locked
 *     visual signature for "this is the row's identifier."
 *   - When `href` is provided, wraps in `<Link>` with the canonical
 *     hover transition (`hover:text-[var(--brand-default)]`).
 *   - When `href` is omitted, renders a `<span>` — the row's
 *     `onRowClick` carries the page-navigation contract for
 *     entire-row click targets (Risks / Assets / Findings).
 *
 * NOT a wrapper for icons, leading badges, trailing chips, or
 * sub-text. Pages that need those should put them in SEPARATE
 * columns. The title cell stays single-line, single-element.
 */

import { cn } from '@dub/utils';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';

export interface TableTitleCellProps {
    /** The title text — usually `entity.title` / `entity.name` / `entity.code`. */
    children: ReactNode;
    /**
     * Optional href. When set, wraps the title in `<Link>` with the
     * canonical brand-tone hover. When omitted, renders a `<span>`
     * (whole-row `onRowClick` handles navigation).
     */
    href?: string;
    /** Forwarded to the underlying Link / span (E2E selector). */
    id?: string;
    /** Override styling — additive to the canonical class string. */
    className?: string;
}

const TITLE_CELL_BASE =
    'font-medium text-content-emphasis text-sm';

const TITLE_CELL_LINK_HOVER =
    'hover:text-[var(--brand-default)] transition-colors duration-150 ease-out';

export function TableTitleCell({
    children,
    href,
    id,
    className,
}: TableTitleCellProps) {
    if (href) {
        return (
            <Link
                href={href}
                id={id}
                className={cn(TITLE_CELL_BASE, TITLE_CELL_LINK_HOVER, className)}
                // R13-PR15 — title-link click semantics changed to
                // match the rest of the row:
                //   - PLAIN left-click: preventDefault on the link so
                //     it doesn't navigate. Lets the row's `onClick`
                //     fire (selection toggle).
                //   - Modifier-click (cmd / ctrl / shift / alt) or
                //     middle-click: keep the link's default
                //     behaviour (open in new tab / new window). The
                //     `href` is preserved on the element so the
                //     browser still drives those gestures.
                //   - DOUBLE-CLICK on the row body: the row's
                //     `onDoubleClick` (existing) handles
                //     navigation via `onRowClick`.
                // R13-PR1's `e.stopPropagation()` was kept here
                // historically to prevent the row's old single-
                // click navigation from racing the link's
                // navigation. After R13-PR14 the row's onClick is
                // for selection — propagation MUST reach the row
                // so the click can toggle. So stopPropagation is
                // gone.
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    if (
                        e.button === 0 &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.shiftKey &&
                        !e.altKey
                    ) {
                        e.preventDefault();
                    }
                }}
            >
                {children}
            </Link>
        );
    }
    return (
        <span id={id} className={cn(TITLE_CELL_BASE, className)}>
            {children}
        </span>
    );
}
