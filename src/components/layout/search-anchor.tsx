'use client';

/**
 * Roadmap-14 PR-6 — `<SearchAnchor>` — the global ⌘K search pill.
 *
 * Mounts in the top-bar's centre slot. Trigger for the existing
 * command palette (Epic 57; provider in
 * `src/components/command-palette/command-palette-provider.tsx`).
 *
 * Two interaction paths converge here:
 *
 *   • POINTER — click the pill, the command palette opens. The
 *     pill is the discoverable affordance for users who don't yet
 *     know about the keyboard shortcut.
 *
 *   • KEYBOARD — `⌘K` (Mac) / `Ctrl+K` (everywhere else). Already
 *     registered globally by `<CommandPaletteProvider>` at
 *     `priority: 100, allowInInputs: true, allowWhenOverlayOpen:
 *     true`. The pill displays the shortcut label as a visual
 *     hint; the actual shortcut handling is upstream.
 *
 * Responsive collapse:
 *
 *   • lg+        full pill: search icon + "Search…" label + ⌘K kbd
 *   • below lg   icon-only round button
 *
 * The label "Search…" with a single horizontal ellipsis (`…`, not
 * `...`) follows the search-placeholder vocabulary documented in
 * CLAUDE.md. The pill never says "(Press ⌘K)" — the kbd hint is
 * a discrete chip after the label, not a parenthetical.
 *
 * Platform detection runs once on mount (client-only). During SSR
 * the pill renders with the Mac glyph (`⌘`) as the default —
 * about 60-70% of premium-product users are on Mac per industry
 * surveys; serving them the correct hint without hydration is the
 * right default. Non-Mac users see a one-frame flash on first
 * hydration; subsequent navigations are stable.
 */

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import { useCommandPalette } from '@/components/command-palette/command-palette-provider';
import { NAV_BAR_SLOT_PRESS } from './nav-bar';

// ─── Recipes ───────────────────────────────────────────────────────

const PILL_CLASS =
    // lg+ form — full pill with label + kbd hint
    `hidden lg:inline-flex items-center gap-compact rounded-full border border-border-subtle bg-bg-default/60 px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-bg-muted/60 hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${NAV_BAR_SLOT_PRESS}`;

const ICON_BUTTON_CLASS =
    // below-lg form — icon-only round button
    `inline-flex lg:hidden items-center justify-center h-8 w-8 rounded-full text-content-muted transition-colors hover:bg-bg-muted/60 hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${NAV_BAR_SLOT_PRESS}`;

const KBD_CHIP_CLASS =
    'inline-flex items-center rounded border border-border-subtle bg-bg-default px-1.5 py-0.5 text-[10px] font-medium text-content-subtle';

// ─── Platform detection ────────────────────────────────────────────

/**
 * Returns true if the current client is running macOS. SSR-safe —
 * returns true (the SSR default) on the server so the rendered
 * markup is stable.
 */
function useIsMac(): boolean {
    const [isMac, setIsMac] = useState(true);
    useEffect(() => {
        // `navigator.platform` is deprecated but still the most
        // reliable Mac detector. The replacement (`userAgentData`)
        // isn't shipped on Safari yet. Both are checked here so the
        // detector survives the eventual deprecation.
        const ua =
            typeof navigator !== 'undefined'
                ? (navigator.platform || navigator.userAgent || '')
                : '';
        setIsMac(/Mac|iPad|iPhone|iPod/.test(ua));
    }, []);
    return isMac;
}

// ─── Component ─────────────────────────────────────────────────────

export function SearchAnchor() {
    const { open } = useCommandPalette();
    const isMac = useIsMac();
    const modKey = isMac ? '⌘' : 'Ctrl';

    return (
        <>
            {/* lg+ full pill */}
            <button
                type="button"
                onClick={open}
                className={PILL_CLASS}
                aria-label="Open command palette"
                aria-keyshortcuts="Meta+K Control+K"
                data-testid="top-chrome-search-anchor"
            >
                <Search
                    className="h-3.5 w-3.5 flex-shrink-0"
                    aria-hidden="true"
                />
                <span>Search…</span>
                <kbd className={KBD_CHIP_CLASS} aria-hidden="true">
                    {modKey}K
                </kbd>
            </button>

            {/* below-lg icon-only button. The two trigger forms are
                BOTH mounted; responsive utility classes hide whichever
                doesn't apply. This is intentional — switching elements
                across breakpoints via media query is cheaper than a
                JS-driven match.media swap and avoids hydration
                mismatches. */}
            <button
                type="button"
                onClick={open}
                className={ICON_BUTTON_CLASS}
                aria-label="Open command palette"
                aria-keyshortcuts="Meta+K Control+K"
                data-testid="top-chrome-search-anchor-icon"
            >
                <Search className="h-4 w-4" aria-hidden="true" />
            </button>
        </>
    );
}
