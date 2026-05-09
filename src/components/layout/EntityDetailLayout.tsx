"use client";

/**
 * `EntityDetailLayout` — reusable detail-page shell.
 *
 * Inflect's domain detail pages (controls, risks, policies, vendors,
 * audits, …) share a structural pattern even though their content
 * differs sharply: a back link, a title, a meta row of badges, a
 * right-side action area, an optional tab bar, and a content slot
 * that swaps based on the active tab. The shell extracts those
 * shared concerns into one component so future detail pages adopt
 * a consistent shape without a copy-paste header.
 *
 * What this is NOT:
 *
 *   - A JSON-driven generic "render any entity" meta-framework.
 *     Domain-specific panels (TraceabilityPanel, LinkedTasksPanel,
 *     TestPlansPanel, the controls-overview metadata grid, the
 *     risk inherent-vs-residual scorer) STAY in the page that
 *     owns them. The shell carries layout, not business content.
 *
 *   - A renderer that decides which tabs to show. The page provides
 *     the tab list + active tab + change handler; the shell paints
 *     them.
 *
 *   - A data fetcher. Pages run their own queries and pass the
 *     resulting `loading` / `error` / `empty` flags to the shell.
 *
 * Visual: stays inside the existing token vocabulary (no new colour
 * scales). Header layout matches the prior controls page. Tabs use
 * the same active-bar pattern (border-b accent + emphasis text).
 *
 * The same shell handles the "no tabs" case (simply omit the `tabs`
 * prop) — useful for risks-style pages that stack sections instead.
 */

import { type ReactNode } from 'react';

import { cn } from '@dub/utils';
import { type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';

// ─── Tab descriptor ───────────────────────────────────────────────

export interface EntityDetailTab<TKey extends string = string> {
    /** Stable identifier for the tab. Drives `activeTab` matching. */
    key: TKey;
    /** Visible tab label. */
    label: string;
    /** Optional count badge (e.g. tasks count). Hidden when undefined. */
    count?: number;
    /** When true, the tab is disabled (greyed, not clickable). */
    disabled?: boolean;
}

// ─── Public props ────────────────────────────────────────────────

export interface EntityDetailLayoutProps<TKey extends string = string> {
    /**
     * Breadcrumb trail rendered ABOVE the title. When supplied, prefer
     * this over `back` — breadcrumbs convey ancestor depth that a single
     * back link can't. The two are not mutually exclusive: passing both
     * shows breadcrumbs above + the back link below them, but the
     * canonical pattern is to use one or the other.
     */
    breadcrumbs?: ReadonlyArray<BreadcrumbItem>;
    /** Back-navigation link rendered above the title. Optional. */
    back?: {
        href: string;
        label: string;
    };
    /** Title of the detail page. Plain string OR rich element. */
    title: ReactNode;
    /**
     * Meta row beneath the title — typically a row of status badges
     * (status / applicability / sync state). Optional.
     */
    meta?: ReactNode;
    /**
     * Right-side action area in the header — typically status
     * combobox + primary action buttons. Optional.
     */
    actions?: ReactNode;

    // ── Lifecycle ─────────────────────────────────────────────────

    /**
     * When true, render the loading skeleton instead of the body.
     * The skeleton mirrors the eventual layout (header + tab bar +
     * content card) so the page doesn't visibly "jump" on load.
     */
    loading?: boolean;
    /**
     * Inline error message rendered in place of the body. The shell
     * intentionally does NOT echo back arbitrary error JSON — the
     * caller passes the user-facing string.
     */
    error?: string | null;
    /**
     * Empty-state copy rendered when the entity wasn't found. Pass a
     * string for the default rendering or omit for "Not found.".
     */
    empty?: {
        message: string;
    } | null;

    // ── Tab bar ───────────────────────────────────────────────────

    /**
     * Tab list. Omit for pages that don't use tabs (the shell
     * renders children directly under the header).
     */
    tabs?: ReadonlyArray<EntityDetailTab<TKey>>;
    /** Currently selected tab key. Required when `tabs` is provided. */
    activeTab?: TKey;
    /** Tab-change handler. Required when `tabs` is provided. */
    onTabChange?: (tab: TKey) => void;

    // ── Body ─────────────────────────────────────────────────────

    /** Outer wrapper className override. */
    className?: string;
    /** Stable id forwarded to the outer container (for E2E selectors). */
    id?: string;
    /**
     * Page body. When tabs are configured this is the active tab's
     * content; the page typically conditionally renders based on
     * `activeTab`. When tabs are omitted, this is the entire body.
     */
    children: ReactNode;
}

// ─── Component ──────────────────────────────────────────────────

export function EntityDetailLayout<TKey extends string = string>({
    breadcrumbs,
    back,
    title,
    meta,
    actions,
    loading,
    error,
    empty,
    tabs,
    activeTab,
    onTabChange,
    className,
    id,
    children,
}: EntityDetailLayoutProps<TKey>) {
    if (loading) {
        return <DetailLoadingSkeleton tabCount={tabs?.length ?? 4} />;
    }
    if (error) {
        return (
            <div
                className="p-12 text-center text-content-error"
                role="alert"
                data-testid="entity-detail-error"
            >
                {error}
            </div>
        );
    }
    if (empty) {
        return (
            <div
                className="p-12 text-center text-content-subtle text-sm"
                data-testid="entity-detail-empty"
            >
                {empty.message}
            </div>
        );
    }

    return (
        <div
            id={id}
            className={cn('space-y-section animate-fadeIn', className)}
            data-entity-detail-layout
        >
            {/* Header */}
            <PageHeader
                breadcrumbs={breadcrumbs}
                back={back}
                title={title}
                meta={meta}
                actions={actions}
                data-testid="entity-detail-header"
            />


            {/* Tab bar (optional) */}
            {tabs && tabs.length > 0 && (
                <nav
                    className="flex gap-1 border-b border-border-default overflow-x-auto"
                    role="tablist"
                    aria-label="Detail sections"
                    data-testid="entity-detail-tabs"
                >
                    {tabs.map((t) => {
                        const isActive = activeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`tabpanel-${t.key}`}
                                disabled={t.disabled}
                                className={cn(
                                    'px-4 py-2 text-sm font-medium transition border-b-2 whitespace-nowrap',
                                    isActive
                                        ? 'border-[var(--brand-default)] text-content-emphasis'
                                        : 'border-transparent text-content-muted hover:text-content-emphasis',
                                    t.disabled && 'opacity-50 cursor-not-allowed',
                                )}
                                onClick={() => {
                                    if (!t.disabled && onTabChange) onTabChange(t.key);
                                }}
                                data-testid={`tab-${t.key}`}
                                id={`tab-${t.key}`}
                            >
                                {t.label}
                                {t.count !== undefined && (
                                    <span className="ml-1 text-xs opacity-60">
                                        ({t.count})
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            )}

            {/* Body */}
            {tabs && activeTab ? (
                <div
                    role="tabpanel"
                    id={`tabpanel-${activeTab}`}
                    aria-labelledby={`tab-${activeTab}`}
                    data-testid="entity-detail-tabpanel"
                >
                    {children}
                </div>
            ) : (
                <div data-testid="entity-detail-body">{children}</div>
            )}
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────
//
// Pulled out so test code can mount it directly + so the shell
// doesn't grow JSX at the top of its render. The skeleton mirrors
// the layout: header + tab bar + content card.

function DetailLoadingSkeleton({ tabCount }: { tabCount: number }) {
    return (
        <div
            className="space-y-section animate-fadeIn"
            aria-busy="true"
            data-testid="entity-detail-loading"
        >
            <div className="flex items-center justify-between">
                <div className="space-y-tight">
                    <div className="animate-pulse rounded bg-bg-elevated/60 h-4 w-24" />
                    <div className="animate-pulse rounded bg-bg-elevated/60 h-7 w-64" />
                </div>
            </div>
            <div className="flex gap-1 border-b border-border-default">
                {Array.from({ length: tabCount }).map((_, i) => (
                    <div
                        key={i}
                        className="animate-pulse rounded bg-bg-elevated/60 h-8 w-20 mx-1"
                    />
                ))}
            </div>
            <div className="glass-card p-6 space-y-default">
                <div className="grid grid-cols-2 gap-section">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="space-y-1">
                            <div className="animate-pulse rounded bg-bg-elevated/60 h-3 w-16" />
                            <div className="animate-pulse rounded bg-bg-elevated/60 h-4 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
