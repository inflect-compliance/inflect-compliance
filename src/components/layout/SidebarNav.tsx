'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantContext, useTenantHref, usePermissions } from '@/lib/tenant-context-provider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { StartTourButton } from '@/components/ui/OnboardingTour';
import {
    X,
    LayoutDashboard,
    Building2,
    AlertTriangle,
    ShieldCheck,
    Paperclip,
    FileText,
    ClipboardList,
    ClipboardCheck,
    FlaskConical,
    Truck,
    Map,
    BarChart3,
    Settings,
    LogOut,
    Bell,
    Calendar as CalendarIcon,
    type LucideIcon,
} from 'lucide-react';
import { useCalendarBadge } from './use-calendar-badge';
import { StatusBadge } from '@/components/ui/status-badge';

// ─── Types ───

interface NavItemDef {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: string | number;
    /** If set, item is only shown when this returns true */
    visible?: boolean;
}

interface NavSectionDef {
    title?: string;
    items: NavItemDef[];
}

// ─── Navigation configuration ───

export function useNavSections(): NavSectionDef[] {
    const t = useTranslations('nav');
    const tenantHref = useTenantHref();
    const perms = usePermissions();
    const tenant = useTenantContext();
    // Live badge — fetched lazily; undefined when count is 0 or load fails.
    const calendarBadge = useCalendarBadge(tenant.tenantSlug);

    return [
        {
            items: [
                { href: tenantHref('/dashboard'), label: t('dashboard'), icon: LayoutDashboard },
                { href: tenantHref('/assets'), label: t('assets'), icon: Building2 },
                { href: tenantHref('/risks'), label: t('risks'), icon: AlertTriangle },
                { href: tenantHref('/controls'), label: t('controls'), icon: ShieldCheck },
                { href: tenantHref('/evidence'), label: t('evidence'), icon: Paperclip },
                { href: tenantHref('/policies'), label: t('policies'), icon: FileText },
                { href: tenantHref('/tasks'), label: t('tasks'), icon: ClipboardList },
                { href: tenantHref('/tests'), label: 'Test', icon: FlaskConical },
                {
                    href: tenantHref('/calendar'),
                    label: 'Calendar',
                    icon: CalendarIcon,
                    badge: calendarBadge,
                },
                { href: tenantHref('/audits'), label: 'Audits', icon: ClipboardCheck },
            ],
        },
        {
            title: 'Management',
            items: [
                { href: tenantHref('/vendors'), label: 'Vendor', icon: Truck },
                { href: tenantHref('/frameworks'), label: 'Framework', icon: Map },
                { href: tenantHref('/reports'), label: t('reports'), icon: BarChart3, visible: perms.reports.view },
                { href: tenantHref('/admin'), label: t('admin'), icon: Settings, visible: perms.admin.view },
                { href: tenantHref('/admin/notifications'), label: 'Notify', icon: Bell, visible: perms.admin.view },
            ].filter(item => {
                // DEFENSE-IN-DEPTH (Layer 2 of 2):
                // Layer 1: Server layout uses noStore() to ensure fresh permissions per request.
                // Layer 2: This client-side filter removes gated items based on the resolved permissions.
                // Fail-closed: if `visible` is explicitly set, only include when strictly `true`.
                if (item.visible === undefined) return true; // no gate — always visible
                return item.visible === true;               // gated — only if permission is true
            }),
        },
    ];
}

// ─── NavItem ───

interface NavItemProps {
    href: string;
    icon: LucideIcon;
    label: string;
    active: boolean;
    badge?: string | number;
    onClick?: () => void;
}

function NavItem({ href, icon: Icon, label, active, badge, onClick }: NavItemProps) {
    const slug = href.split('/').pop() ?? '';

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`nav-link ${active ? 'active' : ''}`}
            data-testid={`nav-${slug}`}
        >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
            <span className="nav-link-label">{label}</span>
            {badge != null && (
                <StatusBadge variant="info" size="sm" className="ml-auto tabular-nums">
                    {badge}
                </StatusBadge>
            )}
        </Link>
    );
}

// ─── NavSection ───

interface NavSectionProps {
    title?: string;
    children: React.ReactNode;
}

function NavSection({ title, children }: NavSectionProps) {
    return (
        <div className="nav-section">
            {title && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-content-subtle">
                    {title}
                </p>
            )}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}

// ─── Sidebar content (shared between desktop sidebar and mobile drawer) ───

interface SidebarContentProps {
    user: { name?: string | null };
    onLogout: () => void;
    onNavClick?: () => void;
}

export function SidebarContent({ user, onLogout, onNavClick }: SidebarContentProps) {
    const pathname = usePathname();
    const tc = useTranslations('common');
    const tenant = useTenantContext();
    const sections = useNavSections();

    return (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-4 border-b border-border-subtle">
                <div className="flex items-center gap-tight">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brand-emphasis)] to-[var(--brand-default)] flex items-center justify-center flex-shrink-0">
                        <span className="text-content-inverted text-sm font-bold">IC</span>
                    </div>
                    <span className="text-sm font-semibold text-content-emphasis truncate">{tc('appName')}</span>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 overflow-y-auto" aria-label="Main navigation">
                {sections.map((section, idx) => (
                    <NavSection key={idx} title={section.title}>
                        {section.items.map((item) => (
                            <NavItem
                                key={item.href}
                                href={item.href}
                                icon={item.icon}
                                label={item.label}
                                badge={item.badge}
                                active={pathname.startsWith(item.href)}
                                onClick={onNavClick}
                            />
                        ))}
                    </NavSection>
                ))}
            </nav>

            {/* User */}
            <div className="p-3 border-t border-border-subtle">
                <div className="mb-2 flex items-start justify-between gap-tight">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-content-default truncate">{user.name}</p>
                        <p className="text-xs text-content-muted truncate">{tenant.tenantName}</p>
                        {/* GAP-CI-77: role uses content-muted (not brand-default).
                            The PwC-orange brand colour on light cream is only
                            4.25:1 — below WCAG AA's 4.5:1 for small text — and
                            the role line is informational, not a brand
                            accent. */}
                        <p className="text-xs text-content-muted">{tenant.role}</p>
                    </div>
                    <ThemeToggle id="theme-toggle-desktop" />
                </div>
                {/* Driver.js product tour — manual restart entry.
                    Renders only when the OnboardingTourProvider is
                    mounted (i.e. inside the authenticated tenant
                    shell). The auto-trigger handles first-login;
                    this button is for the "I want to see it again"
                    case. */}
                <div className="mb-1">
                    <StartTourButton />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLogout}
                    className="w-full text-xs"
                    data-testid="nav-logout"
                >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    {tc('signOut')}
                </Button>
            </div>
        </div>
    );
}

// ─── Mobile Drawer ───

interface MobileDrawerProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
    const pathname = usePathname();

    // Close on route change (always close to avoid stale open state)
    useEffect(() => {
        onClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Close on Escape — routed through the shared shortcut system so
    // it respects precedence against any other Escape binding that
    // might happen to be active, and so a contributor grepping for
    // shortcut sources finds it via `useKeyboardShortcut` like every
    // other binding in the app.
    //
    // `scope: 'overlay'` + priority 5 means:
    //   - Fires only while the drawer is mounted (via the
    //     `data-sheet-overlay` marker on the backdrop below).
    //   - Beats selection-clear (priority 2) and filter-clear
    //     (priority 1) if both are somehow simultaneously active.
    //   - Loses to any modal stacking above the drawer (those
    //     override via Radix's native Escape inside their portal).
    useKeyboardShortcut('Escape', onClose, {
        enabled: open,
        scope: 'overlay',
        priority: 5,
        description: 'Close navigation drawer',
    });

    // Lock body scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    return (
        <>
            {/* Backdrop.
                `data-sheet-overlay` is picked up by the shortcut
                registry's overlay selector, so while the drawer is
                open any `scope: 'global'` shortcut (filter clear,
                selection clear, etc.) stands down automatically. */}
            <div
                className={`
                    fixed inset-0 z-40 bg-black/60 backdrop-blur-sm
                    transition-opacity duration-300
                    ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}
                onClick={onClose}
                aria-hidden="true"
                data-testid="nav-drawer-backdrop"
                data-sheet-overlay={open ? 'true' : undefined}
            />

            {/* Drawer */}
            <div
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-bg-default border-r border-border-subtle
                    transform transition-transform duration-300 ease-in-out
                    ${open ? 'translate-x-0' : '-translate-x-full'}
                `}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                data-testid="nav-drawer"
                data-open={open ? 'true' : 'false'}
            >
                {/* Close button — 44px touch target */}
                <button
                    type="button"
                    className="absolute top-3 right-3 p-2 rounded-lg text-content-muted hover:text-content-emphasis hover:bg-bg-muted transition-colors"
                    onClick={onClose}
                    aria-label="Close navigation"
                    data-testid="nav-drawer-close"
                >
                    <X className="w-5 h-5" />
                </button>

                {children}
            </div>
        </>
    );
}
