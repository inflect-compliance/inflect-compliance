'use client';

/**
 * Epic 47.3 — pure-SVG Sankey chart.
 *
 * Why pure SVG instead of d3-sankey or recharts:
 *
 *   - **Bundle**: this view sits next to a 150KB React Flow chunk;
 *     adding 50KB of d3 + d3-sankey for a single supplementary
 *     view pushes the page heavyweight without proportional
 *     value. The simple node-stack + cubic-bezier layout in
 *     `computeSankeyLayout` is enough for typical tenant data
 *     (<50 nodes per column) and lives in 200 LOC.
 *
 *   - **Maintenance surface**: no dependency upgrade tax, no
 *     SVG-rendering quirks from a third-party renderer, the layout
 *     algorithm is unit-tested in isolation.
 *
 *   - **Future swap path**: the component reads a typed
 *     `SankeyDataset` + a layout helper. Replacing the layout
 *     with d3-sankey later is a one-file change — the contract is
 *     stable.
 */

import { useMemo, useState } from 'react';
import { cn } from '@dub/utils';
import Link from 'next/link';
import { cardVariants } from '@/components/ui/card';
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

// ─── Color tokens (mirror GraphExplorer for visual consistency) ────────

const KIND_COLOR: Record<TraceabilityNodeKind, string> = {
    asset: '#fcd34d', // amber-300
    risk: '#fda4af', // rose-300
    control: '#7dd3fc', // sky-300
    requirement: '#6ee7b7', // emerald-300
    policy: '#c4b5fd', // violet-300
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

    const [hoveredId, setHoveredId] = useState<string | null>(null);

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
            className={cn(
                cardVariants({ density: 'none' }),
                'p-2 overflow-x-auto',
                className,
            )}
        >
            {/* Column legend — labels above the SVG so the columns
                read as named groups, not anonymous bars. */}
            <div
                className="grid mb-1 px-2"
                style={{ gridTemplateColumns: `repeat(${layout.columns.length}, 1fr)` }}
                aria-hidden="true"
            >
                {layout.columns.map((c) => (
                    <div
                        key={c.kind}
                        className="text-[10px] uppercase tracking-wider text-content-subtle"
                        data-sankey-column={c.kind}
                    >
                        {c.label} <span className="text-content-muted">({c.count})</span>
                    </div>
                ))}
            </div>

            <svg
                role="img"
                aria-label="Cross-tier traceability flow (Sankey)"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className="w-full"
                style={{ minHeight: 320 }}
            >
                {/* Links painted first so node bars sit on top. */}
                <g data-sankey-layer="links">
                    {layout.links.map((link) => (
                        <SankeyLinkPath
                            key={link.id}
                            link={link}
                            isHighlighted={
                                hoveredId !== null &&
                                (hoveredId === link.source || hoveredId === link.target)
                            }
                            isDimmed={hoveredId !== null && hoveredId !== link.source && hoveredId !== link.target}
                        />
                    ))}
                </g>
                <g data-sankey-layer="nodes">
                    {layout.nodes.map((node) => (
                        <SankeyNodeRect
                            key={node.id}
                            node={node}
                            highlighted={hoveredId === node.id}
                            onHover={() => setHoveredId(node.id)}
                            onLeave={() => setHoveredId(null)}
                        />
                    ))}
                </g>
            </svg>
        </div>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────

function SankeyLinkPath({
    link,
    isHighlighted,
    isDimmed,
}: {
    link: LaidOutLink;
    isHighlighted: boolean;
    isDimmed: boolean;
}) {
    const baseColor = KIND_COLOR[link.sourceKind] ?? '#94a3b8';
    return (
        <path
            d={link.pathD}
            data-sankey-link-id={link.id}
            data-sankey-relation={link.relation}
            stroke={baseColor}
            strokeWidth={link.strokeWidth}
            fill="none"
            opacity={isDimmed ? 0.05 : isHighlighted ? 0.6 : 0.25}
            style={{ transition: 'opacity 120ms' }}
        >
            <title>
                {link.relation} ({link.value})
            </title>
        </path>
    );
}

function SankeyNodeRect({
    node,
    highlighted,
    onHover,
    onLeave,
}: {
    node: LaidOutNode;
    highlighted: boolean;
    onHover: () => void;
    onLeave: () => void;
}) {
    const color = KIND_COLOR[node.kind] ?? '#94a3b8';
    // Label appears beside the bar — left of leftmost column,
    // right of every other column. Keeps labels off the busy
    // central canvas where flow lines run.
    const labelOnRight = node.x > 0; // left-most column gets label-on-right too because x=0
    return (
        <g
            data-sankey-node-id={node.id}
            data-sankey-node-kind={node.kind}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            style={{ cursor: node.href ? 'pointer' : 'default' }}
        >
            {node.href ? (
                <Link href={node.href}>
                    <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        fill={color}
                        opacity={highlighted ? 1 : 0.85}
                        rx={2}
                    >
                        <title>
                            {node.label} (weight {node.weight})
                        </title>
                    </rect>
                </Link>
            ) : (
                <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    fill={color}
                    opacity={highlighted ? 1 : 0.85}
                    rx={2}
                >
                    <title>
                        {node.label} (weight {node.weight})
                    </title>
                </rect>
            )}
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
        </g>
    );
}

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Re-export so callers that want one import path can pull the
 * dataset-shape type from the component module too.
 */
export type { SankeyDataset } from '@/lib/traceability-graph/sankey';
export type { TraceabilityCategory };
