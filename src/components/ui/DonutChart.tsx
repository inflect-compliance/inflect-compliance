/**
 * DonutChart — Lightweight SVG donut chart for distribution visualization.
 *
 * Zero external dependencies. Uses SVG circle + stroke-dasharray
 * to render proportional arcs. Center can display a summary value.
 *
 * Design:
 *   - Dark-theme friendly (transparent background, slate text)
 *   - Accessible with aria-labels and titles
 *   - Responsive via viewBox (scales to container)
 *   - Smooth segment transitions
 *
 * @example
 * ```tsx
 * <DonutChart
 *     segments={[
 *         { label: 'Open', value: 10, color: '#f59e0b' },
 *         { label: 'Mitigating', value: 5, color: '#22c55e' },
 *         { label: 'Closed', value: 3, color: '#64748b' },
 *     ]}
 *     centerLabel="10"
 *     centerSub="Open"
 *     size={160}
 * />
 * ```
 */

import { ShimmerDots } from '@/components/ui/shimmer-dots';

// ─── Props ──────────────────────────────────────────────────────────

export interface DonutSegment {
    /** Segment label (for legend and accessibility) */
    label: string;
    /** Numeric value */
    value: number;
    /**
     * Segment colour. Accepts either:
     *   - a CSS colour string (hex, rgb, …) for back-compat
     *   - a CSS custom-property name (`var(--bg-success-emphasis)`)
     *
     * Elevation PR-7 — prefer the CSS-var form. Theme flips re-tone
     * the chart automatically because `var()` resolves at paint time
     * against the active theme's tokens. SVG `stroke` and `fill`
     * support `var(...)` natively — no JS resolver needed.
     */
    color: string;
}

export interface DonutChartProps {
    /** Data segments */
    segments: DonutSegment[];
    /** Diameter in px (default: 160) */
    size?: number;
    /** Stroke width for the arc (default: 20) */
    strokeWidth?: number;
    /** Center headline text (e.g. "75%") */
    centerLabel?: string;
    /** Center subtitle text (e.g. "Coverage") */
    centerSub?: string;
    /** Show legend below the chart */
    showLegend?: boolean;
    /** Optional CSS class */
    className?: string;
    /** Optional test-id */
    id?: string;
    /**
     * Epic 64 — render `<ShimmerDots>` inside the donut frame
     * (preserving size for layout stability) while the underlying
     * data is still loading. Distinct from `segments=[]` which
     * renders the "No data" empty state.
     */
    loading?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────

export default function DonutChart({
    segments,
    size = 160,
    strokeWidth = 20,
    centerLabel,
    centerSub,
    showLegend = true,
    className = '',
    id,
    loading = false,
}: DonutChartProps) {
    // Loading takes precedence — shimmer in a same-size box keeps
    // layout stable while the data resolves.
    if (loading) {
        return (
            <div
                id={id}
                className={`flex flex-col items-center ${className}`}
                data-donut-loading
            >
                <div
                    className="rounded-full overflow-hidden"
                    style={{ width: size, height: size }}
                >
                    <ShimmerDots
                        rows={Math.max(4, Math.round(size / 16))}
                        cols={Math.max(4, Math.round(size / 16))}
                        className="h-full w-full"
                        aria-label="Chart loading"
                    />
                </div>
            </div>
        );
    }
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    // Empty state
    if (total === 0) {
        return (
            <div id={id} className={`flex flex-col items-center ${className}`}>
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    role="img"
                    aria-label="No data available"
                >
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="var(--bg-muted)"
                        strokeWidth={strokeWidth}
                        opacity={0.5}
                    />
                    <text
                        x={center}
                        y={center}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--content-muted)"
                        fontSize="14"
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        No data
                    </text>
                </svg>
            </div>
        );
    }

    // Build offset arcs
    let accumulatedOffset = 0;

    return (
        <div id={id} className={`flex flex-col items-center ${className}`}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label={`Donut chart: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}
            >
                {/* Background ring */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="var(--bg-muted)"
                    strokeWidth={strokeWidth}
                />

                {/* Data segments */}
                {segments.map((seg) => {
                    if (seg.value <= 0) return null;
                    const segPercent = seg.value / total;
                    const dashLength = circumference * segPercent;
                    const dashGap = circumference - dashLength;
                    const offset = circumference * accumulatedOffset;

                    // Accumulator pattern inside `.map()` to position
                    // each donut segment relative to the previous. The
                    // mutation is deterministic per render (no closure
                    // leak across renders) but the Compiler rule sees
                    // any `let`-reassignment in render as a violation.
                    // eslint-disable-next-line react-hooks/immutability
                    accumulatedOffset += segPercent;

                    return (
                        <circle
                            key={seg.label}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${dashLength} ${dashGap}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="butt"
                            transform={`rotate(-90 ${center} ${center})`}
                            className="transition-all duration-500"
                        >
                            <title>{`${seg.label}: ${seg.value} (${(segPercent * 100).toFixed(1)}%)`}</title>
                        </circle>
                    );
                })}

                {/* Center label */}
                {centerLabel && (
                    <text
                        x={center}
                        y={centerSub ? center - 6 : center}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--content-emphasis)"
                        fontSize="22"
                        fontWeight="700"
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        {centerLabel}
                    </text>
                )}
                {centerSub && (
                    <text
                        x={center}
                        y={center + 14}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--content-muted)"
                        fontSize="11"
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        {centerSub}
                    </text>
                )}
            </svg>

            {/* Legend */}
            {showLegend && (
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
                    {segments.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-1.5 text-xs text-content-muted">
                            <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: seg.color }}
                            />
                            <span>{seg.label}</span>
                            <span className="text-content-subtle tabular-nums">({seg.value})</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
