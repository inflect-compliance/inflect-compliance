'use client';

/**
 * Roadmap-12 PR-3 — `<NavSection>` primitive.
 *
 * Groups a set of `<NavItem>`s under an optional section header
 * (Govern / Comply / Manage). The header is the chiselled-in
 * label — unmarkable, quiet, definite — that defines a section
 * without shouting.
 *
 * Why a separate file from `nav-item.tsx`:
 *
 *   - `NavSection` is the parent composition unit; `NavItem` is
 *     the leaf. Keeping them in sibling files makes the contract
 *     boundary obvious — section-level recipe lives here, row-level
 *     recipe lives there.
 *   - Future PRs that polish the section header (R12 doesn't go
 *     further; later UI work might) edit ONE file.
 *
 * Section header recipe (R12-PR3):
 *
 *   - `<span>`, not `<p>`. No default `cursor: text`. Reads as
 *     decorative, not selectable.
 *   - `select-none` belt-and-braces — double-click can't highlight
 *     "Govern" / "Comply" / "Manage".
 *   - `text-[10px]` — one click smaller than the canonical Eyebrow.
 *     The sidebar's typographic hierarchy is row label (14px) >
 *     section header (10px) > app brand (14px). Section header is
 *     a whisper, not a headline.
 *   - `tracking-[0.12em]` — letter-spacing that reads as
 *     "deliberate" not "stretched". 0.1em is too tight, 0.16em
 *     feels overconfident at small sizes.
 *   - `text-content-subtle` — one rung quieter than the page-level
 *     Eyebrow. Section headers are scaffolding; row labels are
 *     content.
 *   - 1px hairline above at `border-border-subtle/40` — defines the
 *     section boundary without a hard line. The `/40` alpha keeps
 *     it as a whisper. Skipped on the FIRST section so the very top
 *     of the sidebar doesn't pick up an accidental rule.
 */

import type { ReactNode } from 'react';
import { cn } from '@dub/utils';

export interface NavSectionProps {
    /**
     * Section title. Renders as a `<span>` (no text cursor) with
     * `select-none` (no highlight on double-click). When omitted,
     * the section renders just its children (used for the solo
     * Board home-link group).
     */
    title?: string;
    /**
     * Whether this section is the first one in the sidebar.
     * Suppresses the top hairline so the very top of the sidebar
     * doesn't pick up an accidental rule. Default: false.
     */
    isFirst?: boolean;
    children: ReactNode;
}

/** Section header — the recipe locked by R12-PR3. */
export const NAV_SECTION_HEADER =
    'block px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-subtle select-none';

/** Subtle hairline above the section (skipped on the first section). */
export const NAV_SECTION_DIVIDER =
    'mt-2 pt-2 border-t border-border-subtle/40';

export function NavSection({ title, isFirst = false, children }: NavSectionProps) {
    return (
        <div className={cn(!isFirst && title && NAV_SECTION_DIVIDER)}>
            {title && (
                <span className={NAV_SECTION_HEADER}>
                    {title}
                </span>
            )}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}
