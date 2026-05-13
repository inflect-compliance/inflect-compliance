'use client';

/**
 * Roadmap-16 PR-7 — `<LineChart>` primitive.
 *
 * The R16 lickable line chart. Renders a single series (a date →
 * value array) as:
 *
 *   - A smooth `curveCatmullRom` stroke painted with the
 *     R16-PR1 series colour. No sharp corners — the catmull-rom
 *     interpolation passes through every data point but smooths
 *     the in-between geometry.
 *
 *   - An area under the line filled with a vertical gradient
 *     that fades from the series start-stop (top) to fully
 *     transparent (bottom). The "fade-to-floor" feel that says
 *     "this is a trend, not a histogram".
 *
 *   - On mount: the line path draws itself left-to-right over
 *     600 ms via `stroke-dashoffset` animation. The area fades
 *     in alongside. Once drawn, the line stays static until
 *     R16-PR8 wires hover crosshair + focus-point pulse.
 *
 * The primitive wraps in `<ChartFrame>` so consumers thread a
 * single `ChartState` prop and get loading / empty / error
 * branches for free.
 *
 * What's NOT in this PR:
 *
 *   - Hover crosshair + focus-point pulse. PR-8.
 *   - Multi-series stacking. Single-series only for now.
 *   - X / Y axis labels. The primitive currently renders the
 *     line + area only — consumers can layer their own axes
 *     on top via the existing R16 `<XAxis>` / `<YAxis>` from
 *     the chart-platform barrel if they need axes.
 */
import { useId } from 'react';
import { Group } from '@visx/group';
import { scaleLinear, scaleUtc } from '@visx/scale';
import { Area, LinePath } from '@visx/shape';
import { curveCatmullRom } from '@visx/curve';
import { motion } from 'motion/react';

import { ChartFrame } from './chart-frame';
import {
    ChartLinearGradient,
    chartGradientId,
    type ChartSeriesIndex,
} from './chart-gradient';
import type { ChartState, TimeSeriesPoint } from './types';

/**
 * Default padding around the chart contents. Tighter than the
 * frame's outer padding — the frame's `p-4` is for the chrome,
 * this padding is for the chart's interior margin.
 */
const DEFAULT_PADDING = { top: 12, right: 12, bottom: 12, left: 12 };

/**
 * Mount animation duration. Matches `--chart-mount-duration: 600ms`
 * from R16-PR1. Locked here as a fallback for SSR / tests where
 * CSS vars don't resolve.
 */
const MOUNT_DURATION_MS = 600;

interface LineChartProps {
    /** Discriminated data state. Wraps the data array. */
    state: ChartState<TimeSeriesPoint[]>;
    /** R16 series index (1..6) for the line stroke + area fill. */
    seriesIndex: ChartSeriesIndex;
    /** Outer wrapper className (forwarded to <ChartFrame>). */
    className?: string;
    /** data-testid for the outer wrapper. */
    testId?: string;
    /** Optional aria-label override on the SVG. */
    ariaLabel?: string;
    /**
     * Whether to render the area under the line. Defaults to true.
     * Set false for a stroke-only sparkline (line + nothing
     * beneath).
     */
    showArea?: boolean;
}

/**
 * Smooth single-series line chart with area-under-line gradient
 * fade and on-mount path draw.
 *
 * Consumer pattern:
 *
 *     const state = useReadinessTrend();  // ChartState<TimeSeriesPoint[]>
 *     return (
 *       <LineChart
 *         state={state}
 *         seriesIndex={1}
 *         testId="readiness-trend"
 *         ariaLabel="Readiness over last 30 days"
 *       />
 *     );
 */
export function LineChart({
    state,
    seriesIndex,
    className,
    testId,
    ariaLabel,
    showArea = true,
}: LineChartProps) {
    const reactId = useId();
    const chartId = `line-${reactId.replace(/:/g, '')}`;
    const strokeGradId = chartGradientId(chartId, seriesIndex, 'linear');
    const areaGradId = `${chartId}-area`;

    return (
        <ChartFrame state={state} className={className} testId={testId}>
            {({ width, height, data }) => {
                if (data.length === 0) return null;

                const padding = DEFAULT_PADDING;
                const innerWidth = Math.max(0, width - padding.left - padding.right);
                const innerHeight = Math.max(0, height - padding.top - padding.bottom);

                const xExtent = [data[0]!.date, data[data.length - 1]!.date] as [
                    Date,
                    Date,
                ];
                const yValues = data.map((d) => d.value);
                const yMin = Math.min(...yValues);
                const yMax = Math.max(...yValues);
                // Top padding inside the y-range so the line
                // never crashes into the top edge of the area.
                const yPadding = (yMax - yMin) * 0.1 || 1;

                const xScale = scaleUtc({
                    domain: xExtent,
                    range: [0, innerWidth],
                });
                const yScale = scaleLinear({
                    domain: [yMin - yPadding, yMax + yPadding],
                    range: [innerHeight, 0],
                    clamp: true,
                });

                const x = (d: TimeSeriesPoint) => xScale(d.date);
                const y = (d: TimeSeriesPoint) => yScale(d.value);
                const y0 = () => innerHeight;

                return (
                    <svg
                        width={width}
                        height={height}
                        role="img"
                        aria-label={ariaLabel ?? 'Line chart'}
                    >
                        <defs>
                            {/* Stroke gradient — horizontal so the
                                series tone shifts subtly from
                                left-to-right along the trend. */}
                            <ChartLinearGradient
                                id={strokeGradId}
                                series={seriesIndex}
                                direction="horizontal"
                            />
                            {/* Area gradient — vertical, fading
                                from the series start-stop at the
                                top to fully transparent at the
                                bottom. R16-PR1's
                                <ChartLinearGradient> doesn't
                                directly express transparency, so
                                we build this one inline using the
                                series CSS-var stops. */}
                            <linearGradient
                                id={areaGradId}
                                x1="0%"
                                y1="0%"
                                x2="0%"
                                y2="100%"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={`var(--chart-series-${seriesIndex}-start)`}
                                    stopOpacity={0.45}
                                />
                                <stop
                                    offset="60%"
                                    stopColor={`var(--chart-series-${seriesIndex}-end)`}
                                    stopOpacity={0.15}
                                />
                                <stop
                                    offset="100%"
                                    stopColor={`var(--chart-series-${seriesIndex}-end)`}
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>

                        <Group left={padding.left} top={padding.top}>
                            {/* Area under the line — fades in on
                                mount alongside the line draw. */}
                            {showArea && (
                                <motion.g
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{
                                        duration: MOUNT_DURATION_MS / 1000,
                                        ease: 'easeOut',
                                    }}
                                >
                                    <Area
                                        data={data}
                                        x={x}
                                        y0={y0}
                                        y1={y}
                                        curve={curveCatmullRom}
                                        fill={`url(#${areaGradId})`}
                                    />
                                </motion.g>
                            )}

                            {/* Line path. The path-draw animation
                                runs via framer-motion's
                                `pathLength` which works on
                                `<motion.path>` directly. We use
                                visx's LinePath render-prop API
                                to obtain the generated d-string
                                and feed it into <motion.path>. */}
                            <LinePath
                                data={data}
                                x={x}
                                y={y}
                                curve={curveCatmullRom}
                            >
                                {({ path }) => {
                                    const d = path(data);
                                    if (d === null) return null;
                                    return (
                                        <motion.path
                                            d={d}
                                            stroke={`url(#${strokeGradId})`}
                                            strokeWidth={2}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: 1 }}
                                            transition={{
                                                duration:
                                                    MOUNT_DURATION_MS / 1000,
                                                ease: 'easeOut',
                                            }}
                                        />
                                    );
                                }}
                            </LinePath>
                        </Group>
                    </svg>
                );
            }}
        </ChartFrame>
    );
}
