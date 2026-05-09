"use client";

/**
 * `<PageHeader>` — single canonical page-header primitive (v2-PR-5).
 *
 * Replaces the hand-rolled header blocks across the layout shells:
 * `<EntityListPage header>` and `<EntityDetailLayout>` both consumed
 * to spell out the same flex/wrap/breadcrumbs/title/actions structure
 * with subtly different copy (e.g. `count` vs `description`). One
 * primitive, one composition recipe, one set of test ids.
 *
 * Composition slots (top → bottom inside the title column):
 *
 *   1. breadcrumbs   — `<Breadcrumbs items=[…]>` trail above the
 *                       eyebrow / back link / title. Optional.
 *   2. back          — `← Label` text link, rendered when no
 *                       breadcrumbs are supplied (or in addition to,
 *                       when both are passed). Optional.
 *   3. eyebrow       — small uppercase label above the title (e.g.
 *                       resource name). Optional.
 *   4. title         — `<Heading level={1}>` (required).
 *   5. description   — muted body copy below the title. One sentence,
 *                       ≤ 80 chars. Optional.
 *   6. meta          — horizontal row of badges / chips below the
 *                       description (or title if no description).
 *                       Optional.
 *
 * Right cluster: `actions` — typically a single primary `<Button>`
 * + 1 secondary + 1 overflow menu.
 *
 * Render contract:
 *   - `<header>` element with `flex items-start justify-between
 *     gap-default flex-wrap`.
 *   - Title column (`min-w-0`) carries the breadcrumbs/back/eyebrow/
 *     title/description/meta stack.
 *   - Actions cluster wraps its children in `flex gap-tight flex-wrap`.
 *   - Stable test ids per slot so consumers can target them
 *     consistently in E2E tests.
 *
 * Pairs with:
 *   - `EntityListPage` and `EntityDetailLayout` adopt this primitive
 *     internally (they used to spell the structure inline).
 *   - Application pages that aren't list/detail shells (admin,
 *     dashboards, auth) can — and should — adopt this primitive
 *     directly in subsequent PRs.
 *
 * Why this is one primitive across both shells:
 *   - Identical visual rhythm (typography ratio, spacing, action
 *     cluster placement).
 *   - One place to land "every page header gets a quiet eyebrow"
 *     when v2-PR-12 (List header trio) lands.
 *   - One ratchet target — `<Heading level={1}>` outside the
 *     primitive becomes an architectural smell.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@dub/utils";
import {
    Breadcrumbs,
    type BreadcrumbItem,
} from "@/components/ui/breadcrumbs";
import {
    Caption,
    Eyebrow,
    Heading,
} from "@/components/ui/typography";

export interface PageHeaderBackLink {
    href: string;
    label: string;
}

export interface PageHeaderProps {
    /**
     * Breadcrumb trail rendered ABOVE the title. When supplied, prefer
     * this over `back` for deep navigation contexts. Both can co-
     * exist — breadcrumbs convey ancestor depth, back is a one-tap
     * affordance.
     */
    breadcrumbs?: ReadonlyArray<BreadcrumbItem>;
    /** `← Label` back-navigation link rendered above the title. */
    back?: PageHeaderBackLink;
    /** Small uppercase eyebrow rendered above the title. */
    eyebrow?: React.ReactNode;
    /** Required `<Heading level={1}>` content. */
    title: React.ReactNode;
    /** Optional DOM id placed on the title <Heading> element (E2E anchor). */
    titleId?: string;
    /**
     * Optional descriptive sentence below the title. One sentence,
     * ≤ 80 chars per the v2 polish copy convention.
     */
    description?: React.ReactNode;
    /**
     * Horizontal row of meta badges / chips below the description
     * (or title if no description).
     */
    meta?: React.ReactNode;
    /** Right-aligned actions (button cluster, overflow menu). */
    actions?: React.ReactNode;
    /** Layout overrides on the outer `<header>` element. */
    className?: string;
    /** Forwarded to the outer `<header>` element. */
    "data-testid"?: string;
}

export function PageHeader({
    breadcrumbs,
    back,
    eyebrow,
    title,
    titleId,
    description,
    meta,
    actions,
    className,
    "data-testid": dataTestId,
}: PageHeaderProps) {
    return (
        <header
            className={cn(
                "flex items-start justify-between gap-default flex-wrap",
                className,
            )}
            data-testid={dataTestId}
        >
            <div className="min-w-0">
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <Breadcrumbs
                        items={breadcrumbs}
                        className="mb-1"
                        data-testid="page-header-breadcrumbs"
                    />
                )}
                {back && (
                    <Link
                        href={back.href}
                        className="text-content-muted text-xs hover:text-content-emphasis transition-colors duration-150 ease-out"
                        data-testid="page-header-back"
                    >
                        ← {back.label}
                    </Link>
                )}
                {eyebrow && (
                    <Eyebrow data-testid="page-header-eyebrow">
                        {eyebrow}
                    </Eyebrow>
                )}
                <Heading
                    level={1}
                    id={titleId}
                    className={cn(back && "mt-1")}
                    data-testid="page-header-title"
                >
                    {title}
                </Heading>
                {description !== undefined && description !== null && (
                    <Caption data-testid="page-header-description">
                        {description}
                    </Caption>
                )}
                {meta && (
                    <div
                        className="flex gap-tight mt-1 flex-wrap items-center"
                        data-testid="page-header-meta"
                    >
                        {meta}
                    </div>
                )}
            </div>
            {actions && (
                <div
                    className="flex gap-tight flex-wrap"
                    data-testid="page-header-actions"
                >
                    {actions}
                </div>
            )}
        </header>
    );
}
