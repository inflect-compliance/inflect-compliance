'use client';

/**
 * Roadmap-12 PR-1 — `<NavItem>` primitive.
 *
 * The sidebar's only first-class element. Every later Roadmap-12 PR
 * (geometry lock, hover lick, active conviction, focus story, badge,
 * icon discipline) edits the tokens in this file and nowhere else.
 *
 * Why a separate file:
 *
 *   - Previously `NavItem` lived inline at the bottom of
 *     `SidebarNav.tsx`. The tenant sidebar mounts it; the org sidebar
 *     re-implements an almost-identical `OrgNavItem` in
 *     `OrgSidebarNav.tsx`. Two copies of the same recipe.
 *   - Hoisting the recipe into one primitive (and exporting the class
 *     strings as named consts) gives the rest of Roadmap-12 a single
 *     place to land changes. The ratchet
 *     `tests/guards/nav-item-import-discipline.test.ts` locks the
 *     contract: no hand-rolled `<Link>` with the load-bearing
 *     geometry (`min-h-[44px] rounded-lg`) outside this file.
 *
 * State vocabulary (locked by later PRs):
 *
 *   - default       muted text, transparent bg
 *   - hover         emphasis text, bg-muted/50 (R12-PR4 tightens)
 *   - active        emphasis text, brand-subtle bg, brand left-edge
 *   - focus-visible 2px ring at --ring (canonical yellow)
 *
 * The transition is `transition-colors` (motion-language ratchet —
 * duration MUST enumerate the property, never `transition-all`).
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';

export interface NavItemProps {
    /** Tenant-prefixed href. */
    href: string;
    /** Lucide icon component (rendered at 18×18). */
    icon: LucideIcon;
    /** Visible label. Truncates on overflow. */
    label: string;
    /** Whether this item is the current page. Drives the active state. */
    active: boolean;
    /** Optional count chip (e.g. calendar upcoming-event count). */
    badge?: string | number;
    /** Optional click handler — used by the mobile drawer to close itself. */
    onClick?: () => void;
}

/**
 * Geometry — shared by every state. R12-PR2 will lock these tokens
 * with rationale.
 */
export const NAV_ITEM_BASE =
    'flex items-center gap-compact px-3 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors duration-150 ease-out border-l-2 border-l-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';

/** Default state — humble, ready, quiet. */
export const NAV_ITEM_DEFAULT =
    'text-content-muted hover:text-content-emphasis hover:bg-bg-muted/50';

/** Active state — conviction. Brand-subtle bg + 2px brand left-edge. */
export const NAV_ITEM_ACTIVE =
    'text-content-emphasis bg-[var(--brand-subtle)] border-l-[var(--brand-default)] font-medium';

export function NavItem({ href, icon: Icon, label, active, badge, onClick }: NavItemProps) {
    const slug = href.split('/').pop() ?? '';

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`${NAV_ITEM_BASE} ${active ? NAV_ITEM_ACTIVE : NAV_ITEM_DEFAULT}`}
            data-testid={`nav-${slug}`}
        >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {badge != null && (
                <StatusBadge variant="info" size="sm" className="ml-auto tabular-nums">
                    {badge}
                </StatusBadge>
            )}
        </Link>
    );
}
