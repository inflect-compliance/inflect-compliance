'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Menu } from 'lucide-react';
import { OrgSidebarContent } from '@/components/layout/OrgSidebarNav';
import { MobileDrawer } from '@/components/layout/SidebarNav';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

// ─── Types ────────────────────────────────────────────────────────────

interface OrgAppShellUser {
    name?: string | null;
}

interface OrgAppShellProps {
    user: OrgAppShellUser;
    appName: string;
    children: React.ReactNode;
}

/**
 * Org-scoped app shell — Epic O-4.
 *
 * Mirror of the tenant `AppShell` (`src/components/layout/AppShell.tsx`)
 * with two intentional differences:
 *
 *   1. Mounts `OrgSidebarContent` instead of `SidebarContent` — the
 *      navigation surface is org-scoped (Portfolio / Tenants /
 *      drill-down lists / Members / Settings) rather than tenant-
 *      scoped (Dashboard / Risks / Controls / …).
 *
 *   2. Reuses `MobileDrawer` directly — that primitive is generic
 *      (just the off-canvas chrome), so duplicating it would buy
 *      nothing.
 *
 * The chrome (mobile top bar, scrolling rules, viewport-clamp behavior,
 * keyboard-shortcut wiring through MobileDrawer) is identical to
 * AppShell so the two contexts feel the same to the user.
 */
export function OrgAppShell({ user, appName, children }: OrgAppShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    const handleLogout = useCallback(async () => {
        await signOut({ callbackUrl: '/login' });
    }, []);

    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    // Auto-close drawer on route change.
    const pathname = usePathname();
    const prevPathname = useRef(pathname);
    useEffect(() => {
        if (prevPathname.current !== pathname) {
            setDrawerOpen(false);
            prevPathname.current = pathname;
        }
    }, [pathname]);

    return (
        <div className="min-h-screen md:h-full md:overflow-hidden flex">
            {/* Desktop sidebar — hidden on mobile, visible on md+ */}
            <aside className="hidden md:flex w-56 bg-bg-default border-r border-border-subtle flex-col flex-shrink-0">
                <OrgSidebarContent user={user} onLogout={handleLogout} />
            </aside>

            {/* Mobile drawer — only renders overlay on <md */}
            <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
                <OrgSidebarContent
                    user={user}
                    onLogout={handleLogout}
                    onNavClick={closeDrawer}
                />
            </MobileDrawer>

            {/* Main content */}
            <main className="flex-1 overflow-auto md:overflow-hidden md:flex md:flex-col min-w-0 md:min-h-0">
                {/* Mobile top bar — visible on <md only */}
                <div className="md:hidden sticky top-0 z-30 flex items-center gap-compact px-4 py-2 bg-bg-page/80 backdrop-blur-sm border-b border-border-subtle">
                    <button
                        type="button"
                        className="p-2 rounded-lg text-content-muted hover:text-content-emphasis hover:bg-bg-muted transition-colors"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open organization navigation menu"
                        data-testid="org-nav-toggle"
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
                        <ThemeToggle id="org-theme-toggle-mobile" />
                    </div>
                </div>

                {/* Inner content container — same flex chain as AppShell. */}
                <div className="p-4 md:p-6 max-w-7xl mx-auto md:flex md:flex-col md:flex-1 md:min-h-0 md:overflow-y-auto md:w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
