'use client';

/**
 * Roadmap-21 PR-B — Sankey rebuild on the R16 chart-token family.
 *
 * Why this rebuild. The Epic 47.3 SVG Sankey shipped with hard-
 * coded hex colours per kind (amber-300 / rose-300 / sky-300 / …).
 * Useful at the time, but it left the Sankey speaking a different
 * colour vocabulary from every other chart on the dashboard. R16
 * established the `--chart-series-{1..6}-start/-end` token family
 * + `<ChartLinearGradient>` defs as the canonical chart-fill
 * mechanism; the donut, line, radar, gantt, and (now) heatmaps
 * all share it. R21 PR-B brings the Sankey in.
 *
 * What changes from the Epic 47.3 baseline:
 *
 *   1. KIND_SERIES maps each `TraceabilityNodeKind` to a chart-
 *      series index. Preserves the visual identity (amber/rose/
 *      cyan/green/violet) while routing through the token system
 *      so dark/light theme switches and any future token tuning
 *      flow automatically.
 *
 *   2. Links and nodes paint via `url(#gradient-id)` referencing
 *      `<ChartLinearGradient>` defs at the top of the SVG. The
 *      link stroke gradient runs horizontally (135° equivalent
 *      via `direction="horizontal"`), giving each flow a felt
 *      "movement" direction.
 *
 *   3. Hover-pop: hovered links lift to a higher stroke-width and
 *      reset their opacity. Non-hovered links dim to 0.05 (was
 *      already there, retained). The hovered-node's INBOUND and
 *      OUTBOUND links both stay lit.
 *
 *   4. Click-isolate: clicking a node PINS the highlight state
 *      so the user can read connections without hover-tracking.
 *      Clicking the same node again (or anywhere else) unpins.
 *      ESC also unpins for keyboard users.
 *
 *   5. `<ChartLegend variant="series">` (R21-PR-A primitive)
 *      replaces the bare-text column header. The legend swatches
 *      paint with the same gradient defs the nodes use, so the
 *      legend is visually CONTINUOUS with the chart — not two
 *      separate colour vocabularies that happen to match.
 *
 *   6. Node values surface inline. The Epic 47.3 layout already
 *      exposed `node.weight`; PR-B promotes it from a tooltip
 *      `<title>` to a small inline annotation next to the label.
 *
 * Out of scope for PR-B (deliberate):
 *   - The layout helper (`computeSankeyLayout`) is unchanged.
 *     R21 PR-D's funnel work and PR-C's heatmap work both leave
 *     their layout helpers untouched; the contract is "redesign
 *     the surface, not the geometry".
 *   - No new dependencies. d3-sankey is still rejected on bundle
 *     grounds (see the Epic 47.3 doc-block).
 */

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@dub/utils';
import Link from 'next/link';
import { cardVariants } from '@/components/ui/card';
import {
    ChartLegend,
    ChartLinearGradient,
    type ChartSeriesIndex,
} from '@/components/ui/charts';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import {
    type LaidOutLink,
    type LaidOutNode,
    type SankeyDataset,
    buildSankeyDataset,
    computeSankeyLayout,
    type SankeyLayout,
} from '@/lib/traceability-graph/sankey';
import type {
    TraceabilityCategory,
    TraceabilityGraph,
    TraceabilityNodeKind,
} from '@/lib/traceability-graph/types';

// ─── Public props ──────────────────────────────────────────────────────

export interface SankeyChartProps {
    graph: TraceabilityGraph;
    /** Search term — same one the explorer + table consume. */
    searchQuery?: string;
    id?: string;
    className?: string;
    /**
     * Canvas size override. The default uses an internal
     * `min-h` + responsive width via `viewBox`; override only when
     * the page layout demands a fixed size.
     */
    width?: number;
    height?: number;
}

// ─── Kind → chart-series index map ────────────────────────────────────
//
// Preserves the visual identity established in Epic 47.3 (amber-rose-
// cyan-emerald-violet) while routing through the R16 chart-series
// tokens. Dark + light theme tokens are paired per series — the
// Sankey now flips with the theme like every other chart.

const KIND_SERIES: Record<TraceabilityNodeKind, ChartSeriesIndex> = {
    asset: 6, // amber
    risk: 4, // pink (was rose)
    control: 2, // cyan (was sky)
    requirement: 5, // green (was emerald)
    policy: 3, // violet
};

const KIND_LABEL: Record<TraceabilityNodeKind, string> = {
    asset: 'Asset',
    risk: 'Risk',
    control: 'Control',
    requirement: 'Requirement',
    policy: 'Policy',
};

// ─── Component ─────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 480;

export function SankeyChart({
    graph,
    searchQuery,
    id = 'sankey-chart',
    className,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
}: SankeyChartProps) {
    const dataset = useMemo<SankeyDataset>(
        () => buildSankeyDataset(graph, { searchQuery }),
        [graph, searchQuery],
    );
    const layout = useMemo<SankeyLayout>(
        () => computeSankeyLayout(dataset, { width, height }),
        [dataset, width, height],
    );

    // Hover + pinned states. `activeId` is derived from the two —
    // hover takes precedence while the cursor is over a node; on
    // mouse-leave the pinned id (if any) wins.
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [pinnedId, setPinnedId] = useState<string | null>(null);
    const activeId = hoveredId ?? pinnedId;

    // ESC unpins for keyboard users. Routed through
    // `useKeyboardShortcut` (the canonical shared registry) instead
    // of a raw `window.addEventListener` — the project's
    // `keyboard-shortcut-conventions.test.ts` guardrail bans the
    // raw form so all shortcuts share the same focus/scope/inputs
    // safety net.
    useKeyboardShortcut(
        'Escape',
        () => {
            if (pinnedId) setPinnedId(null);
        },
        {
            description: 'Unpin Sankey node',
            enabled: pinnedId !== null,
        },
    );

    const onNodeClick = useCallback(
        (nodeId: string) => {
            setPinnedId((prev) => (prev === nodeId ? null : nodeId));
        },
        [],
    );

    // Which kinds appear in this graph? Drives both the legend +
    // the `<defs>` block (we only emit gradients we actually use).
    const presentKinds = useMemo<TraceabilityNodeKind[]>(() => {
        const set = new Set<TraceabilityNodeKind>();
        for (const node of layout.nodes) set.add(node.kind);
        return Array.from(set);
    }, [layout.nodes]);

    // Empty / no-flow states get a clear message.
    if (dataset.nodes.length === 0) {
        return (
            <div
                id={id}
                data-sankey-chart="true"
                data-sankey-empty="true"
                className={cn(
                    cardVariants({ density: 'none' }),
                    'text-center py-10 text-content-subtle',
                    className,
                )}
            >
                {dataset.emptyAfterFilter
                    ? `No flows match "${(searchQuery ?? '').trim()}"`
                    : 'No mapping flows to display.'}
            </div>
        );
    }
    if (dataset.links.length === 0) {
        return (
            <div
                id={id}
                data-sankey-chart="true"
                data-sankey-no-links="true"
                className={cn(
                    cardVariants({ density: 'none' }),
                    'text-center py-10 text-content-subtle',
                    className,
                )}
            >
                Nodes are present but no cross-tier mapping flows have been recorded yet.
            </div>
        );
    }

    return (
        <div
            id={id}
            data-sankey-chart="true"
            data-sankey-node-count={layout.nodes.length}
            data-sankey-link-count={layout.links.length}
            data-sankey-pinned-id={pinnedId ?? undefined}
            className={cn(
                cardVariants({ density: 'none' }),
                'p-2 overflow-x-auto',
                className,
            )}
        >
            {/* R21-PR-B: ChartLegend variant=series replaces the
                Epic 47.3 inline column-text header. The dots paint
                via the same chart-series gradient defs the nodes
                consume; legend ↔ chart visually continuous. */}
            <ChartLegend
                variant="series"
                className="mb-2 px-2"
                series={presentKinds.map((kind) => ({
                    name: KIND_LABEL[kind],
                    index: KIND_SERIES[kind],
                }))}
            />

            <svg
                role="img"
                aria-label="Cross-tier traceability flow (Sankey)"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className="w-full"
                style={{ minHeight: 320 }}
                onClick={(e) => {
                    // Click on empty SVG canvas (not a node) unpins.
                    if (e.target === e.currentTarget && pinnedId) {
                        setPinnedId(null);
                    }
                }}
            >
                {/* R16 chart-series gradients — one def per kind in use. */}
                <defs>
                    {presentKinds.map((kind) => (
                        <ChartLinearGradient
                            key={kind}
                            id={`${id}-${kind}-gradient`}
                            series={KIND_SERIES[kind]}
                            direction="horizontal"
                        />
                    ))}
                </defs>

                {/* Links painted first so node bars sit on top. */}
                <g data-sankey-layer="links">
                    {layout.links.map((link) => (
                        <SankeyLinkPath
                            key={link.id}
                            chartId={id}
                            link={link}
                            isHighlighted={
                                activeId !== null &&
                                (activeId === link.source ||
                                    activeId === link.target)
                            }
                            isDimmed={
                                activeId !== null &&
                                activeId !== link.source &&
                                activeId !== link.target
                            }
                        />
                    ))}
                </g>
                <g data-sankey-layer="nodes">
                    {layout.nodes.map((node) => (
                        <SankeyNodeRect
                            key={node.id}
                            chartId={id}
                            node={node}
                            highlighted={activeId === node.id}
                            pinned={pinnedId === node.id}
                            onHover={() => setHoveredId(node.id)}
                            onLeave={() => setHoveredId(null)}
                            onClick={() => onNodeClick(node.id)}
                        />
                    ))}
                </g>
            </svg>
        </div>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────

function SankeyLinkPath({
    chartId,
    link,
    isHighlighted,
    isDimmed,
}: {
    chartId: string;
    link: LaidOutLink;
    isHighlighted: boolean;
    isDimmed: boolean;
}) {
    const gradientId = `${chartId}-${link.sourceKind}-gradient`;
    // R21-PR-B hover-pop: highlighted links thicken slightly + lift
    // to higher opacity. Dimmed links drop to 0.05 (Epic 47.3
    // behaviour preserved). The stroke-width pop is a felt
    // emphasis without disturbing the layout — same vocabulary
    // R16 chart hover-pop uses.
    const strokeWidth = isHighlighted ? link.strokeWidth * 1.5 : link.strokeWidth;
    const opacity = isDimmed ? 0.05 : isHighlighted ? 0.7 : 0.3;
    return (
        <path
            d={link.pathD}
            data-sankey-link-id={link.id}
            data-sankey-relation={link.relation}
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            fill="none"
            opacity={opacity}
            style={{
                transition:
                    'opacity 150ms ease-out, stroke-width 150ms ease-out',
            }}
        >
            <title>
                {link.relation} ({link.value})
            </title>
        </path>
    );
}

function SankeyNodeRect({
    chartId,
    node,
    highlighted,
    pinned,
    onHover,
    onLeave,
    onClick,
}: {
    chartId: string;
    node: LaidOutNode;
    highlighted: boolean;
    pinned: boolean;
    onHover: () => void;
    onLeave: () => void;
    onClick: () => void;
}) {
    const gradientId = `${chartId}-${node.kind}-gradient`;
    const labelOnRight = node.x > 0;
    const opacity = highlighted ? 1 : 0.85;
    const rect = (
        <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={`url(#${gradientId})`}
            opacity={opacity}
            rx={2}
            // R21-PR-B: pinned ring + label-side weight annotation.
            // The ring sits just outside the bar; rx matches so the
            // ring tracks the rounded corners.
            style={{
                transition: 'opacity 150ms ease-out',
                outline: pinned ? '1px solid var(--brand-default)' : undefined,
                outlineOffset: 1,
            }}
        >
            <title>
                {node.label} (weight {node.weight})
            </title>
        </rect>
    );
    return (
        <g
            data-sankey-node-id={node.id}
            data-sankey-node-kind={node.kind}
            data-sankey-node-pinned={pinned ? 'true' : undefined}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            style={{ cursor: node.href ? 'pointer' : 'default' }}
        >
            {node.href ? <Link href={node.href}>{rect}</Link> : rect}
            <text
                x={labelOnRight ? node.x - 4 : node.x + node.width + 4}
                y={node.y + node.height / 2}
                dy="0.32em"
                textAnchor={labelOnRight ? 'end' : 'start'}
                className="fill-content-muted"
                fontSize={10}
                pointerEvents="none"
            >
                {truncate(node.label, 24)}
            </text>
            {/* R21-PR-B inline value annotation. Tabular-nums so
                weights line up across rows; brand-default tint when
                the node is highlighted or pinned to draw the eye. */}
            <text
                x={
                    labelOnRight
                        ? node.x - 4 - measureLabel(node.label, 24) * 5.5
                        : node.x + node.width + 4 + measureLabel(node.label, 24) * 5.5
                }
                y={node.y + node.height / 2}
                dy="0.32em"
                textAnchor={labelOnRight ? 'end' : 'start'}
                className={cn(
                    'fill-content-subtle font-mono tabular-nums',
                    highlighted && 'fill-[var(--brand-default)]',
                )}
                fontSize={9}
                pointerEvents="none"
            >
                {node.weight}
            </text>
        </g>
    );
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Rough character-count measurement for the inline value-annotation
 * offset. The value is placed just past the label; 5.5px per char
 * at fontSize 10 is a hair generous but reads correctly across
 * variable-width fonts (closer than letting the value collide).
 */
function measureLabel(label: string, max: number): number {
    return Math.min(label.length, max);
}

/**
 * Re-export so callers that want one import path can pull the
 * dataset-shape type from the component module too.
 */
export type { SankeyDataset } from '@/lib/traceability-graph/sankey';
export type { TraceabilityCategory };
