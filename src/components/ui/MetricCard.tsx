"use client";

/**
 * `<MetricCard>` — chassis primitive for "single-number" cards (v2-PR-8).
 *
 * Owns the LAYOUT contract for any card that displays a metric:
 *
 *   ┌────────────────────────────────────────┐
 *   │ {icon} EYEBROW LABEL          {action} │
 *   │                                        │
 *   │ {value}              ← large headline  │
 *   │                                        │
 *   │ ↑ +12% vs last month  ← {indicator}    │
 *   │ {subtitle}                             │
 *   │                                        │
 *   │ {trailing — sparkline / progress bar}  │
 *   └────────────────────────────────────────┘
 *
 * Specialised metric cards (KPI, Progress, Trend, Hero) compose via
 * this chassis instead of hand-rolling the spacing / typography /
 * card frame. The chassis is intentionally LAYOUT-ONLY — formatting
 * the number, animating it, resolving trend direction, choosing the
 * sparkline variant — those stay in the specialised wrapper. The
 * chassis just imposes:
 *
 *   - Consistent card frame (glass-card, padding, rounded radius).
 *   - Eyebrow typography (uppercase, tracking-wide, 11px muted).
 *   - Value typography (large, tabular-nums by default).
 *   - Spacing rhythm (eyebrow → value → indicator → subtitle →
 *     trailing) using semantic spacing tokens.
 *
 * Future polish:
 *   - v2-PR-9 (Card elevation system) replaces the inline
 *     `glass-card` class with `<Card elevation="raised">`.
 *   - v2-PR-10 (Hero metric) ships a new `<HeroMetric>` that wraps
 *     this chassis with the 72px tabular-nums treatment.
 */

import * as React from "react";
import { cn } from "@dub/utils";
import { cardVariants } from "./card";

export interface MetricCardProps {
    /**
     * Optional inline icon rendered to the LEFT of the eyebrow label.
     * Pass any lucide-react icon component (or any React.ElementType
     * with a `className` prop).
     */
    icon?: React.ElementType;
    /**
     * Eyebrow label (uppercase, tracking-wide, muted). Conventionally
     * the resource name or KPI label ("Control Coverage", "Open Risks").
     */
    eyebrow: React.ReactNode;
    /**
     * Optional right-edge slot in the header row — typically a
     * `<Tooltip>`-wrapped info icon or a small action chip.
     */
    headerAction?: React.ReactNode;
    /**
     * The value itself — the specialised wrapper renders the
     * <AnimatedNumber>/<ShimmerDots>/empty-state shape inside this
     * slot. The chassis only carries the typography size + tabular-
     * nums alignment.
     */
    children?: React.ReactNode;
    /**
     * Indicator row below the value — typically the trend chip
     * (delta + direction + label). The wrapper composes the chip;
     * the chassis just renders the slot in the correct spacing.
     */
    indicator?: React.ReactNode;
    /**
     * Subtitle line below the indicator. One sentence, ≤ 80 chars.
     */
    subtitle?: React.ReactNode;
    /**
     * Bottom slot — typically a sparkline, a progress bar, or a
     * 2-row mini-chart. Renders with `mt-default` from the
     * subtitle / indicator above.
     */
    trailing?: React.ReactNode;
    /** Optional className forwarded to the outer card frame. */
    className?: string;
    /** Forwarded to the outer card frame for E2E selectors. */
    id?: string;
}

export function MetricCard({
    icon: Icon,
    eyebrow,
    headerAction,
    children,
    indicator,
    subtitle,
    trailing,
    className,
    id,
}: MetricCardProps) {
    return (
        <div
            id={id}
            data-metric-card
            data-metric-card-corner-glow
            className={cn(
                cardVariants({ density: 'compact' }),
                "relative isolate overflow-hidden",
                "hover:border-border-emphasis transition-colors duration-150 ease-out",
                // R17-PR4 — corner brand glow. Tiny radial wash
                // anchored at the upper-left where the icon + eyebrow
                // sit. Smaller and quieter than the HeroMetric
                // 640×400 ambient glow — these cards live in a stack
                // of 3–6 siblings, so the warmth has to be present
                // without competing for attention. 200px radius +
                // brand-subtle alpha + 55% fade = "highlight on a
                // glass surface", not "glow under a verdict".
                //
                // No breath animation here. Three+ cards breathing
                // in lockstep would be hypnotic; staggering creates
                // visual noise. The hero's masthead is the ONE
                // breathing surface; the cards stay static.
                "before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
                "before:bg-[radial-gradient(circle_200px_at_10%_0%,var(--brand-subtle)_0%,transparent_55%)]",
                className,
            )}
        >
            {/* Header row: icon + eyebrow + (optional) action */}
            <div className="flex items-center gap-tight mb-2">
                {Icon && (
                    <Icon
                        className="w-4 h-4 text-content-muted shrink-0"
                        aria-hidden="true"
                    />
                )}
                <span
                    className="text-xs text-content-muted uppercase tracking-wide font-medium"
                    data-metric-card-eyebrow
                >
                    {eyebrow}
                </span>
                {headerAction && (
                    <span
                        className="ml-auto"
                        data-metric-card-header-action
                    >
                        {headerAction}
                    </span>
                )}
            </div>

            {/* Value slot — the wrapper passes its <AnimatedNumber> /
                <ShimmerDots> / empty placeholder shape. Tabular-nums
                so the digits don't dance during animation.
                Rendered as `<p>` so screen readers and integration
                tests can target the metric value as a single
                paragraph element. */}
            <p
                className="text-2xl font-bold tabular-nums"
                data-metric-card-value
            >
                {children}
            </p>

            {/* Indicator row */}
            {indicator && (
                <div
                    className="flex items-center gap-1 mt-1"
                    data-metric-card-indicator
                >
                    {indicator}
                </div>
            )}

            {/* Subtitle */}
            {subtitle && (
                <p
                    className="text-xs text-content-subtle mt-1"
                    data-metric-card-subtitle
                >
                    {subtitle}
                </p>
            )}

            {/* Trailing slot (sparkline / progress / chart) */}
            {trailing && (
                <div className="mt-2" data-metric-card-trailing>
                    {trailing}
                </div>
            )}
        </div>
    );
}
