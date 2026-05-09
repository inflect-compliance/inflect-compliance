"use client";

/**
 * `<DashboardLayout>` — composition shell for dashboard pages (v2-PR-6).
 *
 * Sits next to `<EntityListPage>` (lists) and `<EntityDetailLayout>`
 * (detail) as the third public layout primitive. Replaces the
 * hand-rolled `<div className="space-y-section animate-fadeIn">` +
 * inline header block that every dashboard page used to spell out.
 *
 * Why the third shell:
 *   Dashboards are NOT lists (no DataTable / FilterToolbar) and NOT
 *   detail pages (no entity, no tab bar). They have their own rhythm:
 *     - title row at top
 *     - stack of metric / chart / list cards in a vertical-section
 *       cadence
 *     - optional final CTA row
 *   Trying to force dashboards through `EntityListPage` would carry
 *   the FilterToolbar slot for nothing; through `EntityDetailLayout`
 *   would carry the tab bar.
 *
 * What the shell carries:
 *   - Outer wrapper with `space-y-section animate-fadeIn` (the
 *     standard dashboard rhythm — vertical sections + fade-in on
 *     first paint).
 *   - Header rendered via `<PageHeader>` (same primitive
 *     `EntityListPage` and `EntityDetailLayout` use), so every page
 *     header in the app reads the same.
 *   - Children passthrough for the body content stack.
 *
 * What stays in the page:
 *   - Section composition (3-up KPI grid, side-by-side charts,
 *     trend section, footer card cluster, etc.).
 *   - Data fetching + state.
 *   - Action wiring (the buttons inside the header `actions` slot).
 *
 * Future polish (v2-PR-10 — Hero metric + 4-zone rhythm) will add
 * formal zone slots ("masthead | story | detail | footer") to this
 * shell. The current API is the minimal viable adoption surface.
 */

import * as React from "react";
import { cn } from "@dub/utils";

import { PageHeader, type PageHeaderProps } from "./PageHeader";

export interface DashboardLayoutProps {
    /**
     * Header configuration delegated to `<PageHeader>`. Same slot
     * shape (breadcrumbs / back / eyebrow / title / description /
     * meta / actions). `title` is the only required field.
     */
    header: PageHeaderProps;
    /** Body content (the dashboard's sections / cards). */
    children: React.ReactNode;
    /** Layout overrides on the outer wrapper. */
    className?: string;
    /** Forwarded to the outer wrapper for E2E selectors. */
    "data-testid"?: string;
}

export function DashboardLayout({
    header,
    children,
    className,
    "data-testid": dataTestId,
}: DashboardLayoutProps) {
    return (
        <div
            className={cn("space-y-section animate-fadeIn", className)}
            data-dashboard-layout
            data-testid={dataTestId}
        >
            <PageHeader {...header} />
            {children}
        </div>
    );
}
