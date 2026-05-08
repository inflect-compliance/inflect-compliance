'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Menu } from 'lucide-react';
import { SidebarContent, MobileDrawer } from '@/components/layout/SidebarNav';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

// ─── Types ───

interface AppShellUser {
    name?: string | null;
}

interface AppShellProps {
    /** Serializable user data resolved server-side */
    user: AppShellUser;
    /** Pre-resolved app name (from server-side i18n) */
    appName: string;
    children: React.ReactNode;
}

/**
 * Client-side app shell.
 *
 * Contains all interactive layout UI that cannot live in a Server Component:
 * - Mobile drawer toggle state
 * - Sign-out handler (requires next-auth/react)
 * - Route-change auto-close for mobile drawer
 *
 * Data-layer providers (QueryClientProvider) live in ClientProviders,
 * composed separately by the server layout.
 *
 * Receives only serializable props from the server layout.
 */
export function AppShell({ user, appName, children }: AppShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    const handleLogout = useCallback(async () => {
        await signOut({ callbackUrl: '/login' });
    }, []);

    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    // Auto-close drawer on route change
    const pathname = usePathname();
    const prevPathname = useRef(pathname);
    useEffect(() => {
        if (prevPathname.current !== pathname) {
            setDrawerOpen(false);
            prevPathname.current = pathname;
        }
    }, [pathname]);

    // Layout chain (Phase 1 of list-page-shell):
    //   • Mobile (<md): natural document scroll. `min-h-screen` on
    //     the wrapper, `overflow-auto` on <main>, no flex-column.
    //     The mobile sticky top bar continues to behave as before.
    //   • Desktop (md+): viewport-clamped flex chain. Wrapper is
    //     `h-screen overflow-hidden`, <main> is a flex column with
    //     `overflow-hidden`. The inner content div is the default
    //     scroll container for pages that DON'T use ListPageShell —
    //     pages that DO use the shell take over the flex chain and
    //     the inner div's overflow-y-auto becomes a no-op (because
    //     the shell is `flex-1 min-h-0` and never overflows the
    //     inner div).
    //
    // Every flex parent in this chain carries `min-h-0` so children
    // can shrink below their content size — without this, `flex-1`
    // grows to content and the chain breaks.
    return (
        // h-full at md+ relies on the html/body lock in globals.css
        // (height: 100%; overflow: hidden at md+). The wrapper fills
        // exactly the viewport because its parent (body) is locked.
        // min-h-screen is the mobile fallback — below md the body
        // scrolls naturally and min-h-screen ensures the shell fills
        // the visible viewport at minimum.
        <div className="min-h-screen md:h-full md:overflow-hidden flex">
            {/* Desktop sidebar — hidden on mobile, visible on md+ */}
            <aside className="hidden md:flex w-56 bg-bg-default border-r border-border-subtle flex-col flex-shrink-0">
                <SidebarContent user={user} onLogout={handleLogout} />
            </aside>

            {/* Mobile drawer — only renders overlay on <md */}
            <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
                <SidebarContent user={user} onLogout={handleLogout} onNavClick={closeDrawer} />
            </MobileDrawer>

            {/* Main content */}
            <main className="flex-1 overflow-auto md:overflow-hidden md:flex md:flex-col min-w-0 md:min-h-0">
                {/* Mobile top bar — visible on <md only */}
                <div className="md:hidden sticky top-0 z-30 flex items-center gap-compact px-4 py-2 bg-bg-page/80 backdrop-blur-sm border-b border-border-subtle">
                    <button
                        type="button"
                        className="p-2 rounded-lg text-content-muted hover:text-content-emphasis hover:bg-bg-muted transition-colors"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open navigation menu"
                        data-testid="nav-toggle"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-tight">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--brand-emphasis)] to-[var(--brand-default)] flex items-center justify-center">
                            <span className="text-content-inverted text-[10px] font-bold">IC</span>
                        </div>
                        <span className="text-sm font-semibold text-content-emphasis">{appName}</span>
                    </div>
                    <div className="ml-auto">
                        <ThemeToggle id="theme-toggle-mobile" />
                    </div>
                </div>

                {/* Inner content container.
                    Mobile: just padding + max-width + centering.
                    Desktop: ALSO a flex column itself so any
                    <ListPageShell> child can claim flex-1 to fill
                    height. Without `md:flex md:flex-col` here, the
                    shell falls back to natural height and the inner
                    div's overflow-y-auto ends up scrolling instead
                    of the table card scrolling internally — which is
                    the exact regression we're fixing. */}
                <div className="p-4 md:p-6 max-w-7xl mx-auto md:flex md:flex-col md:flex-1 md:min-h-0 md:overflow-y-auto md:w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
