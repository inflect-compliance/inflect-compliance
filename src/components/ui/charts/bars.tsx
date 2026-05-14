/* eslint-disable @typescript-eslint/no-explicit-any -- Client component receiving server-rendered domain data; tanstack column callbacks; or library-boundary callbacks. Per-site narrowing requires generated DTOs / per-cell CellContext imports — out of scope for the lint cleanup PR. */
import { cn } from "@dub/utils";
import { RectClipPath } from "@visx/clip-path";
import { Group } from "@visx/group";
import { BarRounded } from "@visx/shape";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { useChartContext } from "./chart-context";
import { ChartGloss, chartGlossId } from "./chart-gloss";

/**
 * R18-PR8 — bubbly bars.
 *
 * Three changes to the Epic-59 `<Bars>` primitive:
 *
 *   1. SETTLE-BOUNCE on mount. Each date-column grows up from the
 *      x-axis baseline through a SPRING (`scaleY` 0 → overshoot →
 *      1), staggered left-to-right by column index. The bars
 *      "bubble up" instead of just fading in.
 *
 *   2. GLOSS. A shared vertical `<ChartGloss>` def; every bar
 *      paints a second `<BarRounded>` overlay with the gloss
 *      fill — the two-layer paint from chart-gloss.tsx.
 *
 *   3. ROUNDER TOPS. The default corner radius bumps 2 → 3 — a
 *      hair bubblier without rounding away the bar's read.
 *
 * The scaleY spring pivots at the column's BOTTOM (the x-axis
 * baseline) via `transformOrigin`, so a stacked column grows as
 * one unit rather than each segment scaling from its own centre.
 */

/** Per-column stagger (ms) so the bars bubble up left-to-right. */
const BAR_STAGGER_MS = 45;

export function Bars({
  seriesStyles,
  radius = 3,
}: {
  seriesStyles?: {
    id: string;
    barClassName?: string;
    barFill?: string;
  }[];
  radius?: number;
}) {
  const clipPathId = useId();
  const reactId = useId();
  const chartId = `bars-${reactId.replace(/:/g, "")}`;
  const {
    data,
    series,
    margin,
    xScale,
    yScale,
    width,
    height,
    startDate,
    endDate,
  } = useChartContext();

  if (!("bandwidth" in xScale))
    throw new Error("Bars require a band scale (type=bar)");

  const activeSeries = series.filter(({ isActive }) => isActive);

  return (
    <Group left={margin.left} top={margin.top}>
      <RectClipPath id={clipPathId} x={0} y={0} width={width} height={height} />
      {/* R18-PR8 — shared gloss def. One vertical sheen for the
          whole bar cluster: every bar is in the same plot under
          the same light. `default` intensity — a full-size chart
          surface, not a sparkline. */}
      <defs>
        <ChartGloss
          id={chartGlossId(chartId)}
          direction="vertical"
          intensity="default"
        />
      </defs>
      <AnimatePresence>
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          key={`${activeSeries.map((s) => s.id).join(",")}_${startDate.toString()}_${endDate.toString()}`}
          clipPath={`url(#${clipPathId})`}
        >
          {data.map((d, columnIndex) => {
            const barWidth = xScale.bandwidth();
            const x = xScale(d.date) ?? 0;

            const sortedSeries = activeSeries
              .filter((s) => s.valueAccessor(d) > 0)
              .sort((a, b) => b.valueAccessor(d) - a.valueAccessor(d));

            const bars = sortedSeries.reduce((acc, s) => {
              const stackHeight = acc.reduce((sum, b) => sum + b.height, 0);
              const value = s.valueAccessor(d) ?? 0;
              const y = yScale(value);

              return [
                ...acc,
                {
                  id: s.id,
                  value,
                  colorClassName: s.colorClassName,
                  styles: seriesStyles?.find(({ id }) => id === s.id),
                  y: stackHeight, // y from x axis to bottom of bar
                  height: height - y, // height from bottom to top of bar
                },
              ];
            }, [] as any[]);

            return (
              // R18-PR8 — settle-bounce. The whole date-column
              // springs up from the x-axis baseline. `scaleY` 0 →
              // 1 through a spring (stiffness/damping tuned for a
              // visible overshoot), pivoted at the column bottom
              // (`transformOrigin` y = `height`, the baseline) so
              // a stacked column grows as one unit. Per-column
              // `delay` staggers the cluster left-to-right.
              <motion.g
                key={d.date.toString()}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  scaleY: {
                    type: "spring",
                    stiffness: 420,
                    damping: 17,
                    delay: (columnIndex * BAR_STAGGER_MS) / 1000,
                  },
                }}
                style={{
                  transformOrigin: `${x + barWidth / 2}px ${height}px`,
                }}
              >
                {bars.map((b, idx) => {
                  const rounding =
                    idx === bars.length - 1
                      ? { top: true, radius }
                      : { radius: 0 };
                  return (
                    <g key={b.id}>
                      {/* Colour layer — the series fill. */}
                      <BarRounded
                        x={x}
                        y={height - b.height - b.y}
                        width={barWidth}
                        height={b.height}
                        className={cn(
                          b.colorClassName ?? "text-brand-emphasis",
                          b.styles?.barClassName,
                        )}
                        fill={b.styles?.barFill || "currentColor"}
                        {...rounding}
                      />
                      {/* R18-PR8 — gloss layer. SAME bar geometry,
                          painted on top, filled with the shared
                          gloss def. The white→transparent ramp
                          gives each bar a glass sheen down its
                          length. aria-hidden + pointer-events:none
                          — light, not data; never intercepts a
                          hover. */}
                      <BarRounded
                        x={x}
                        y={height - b.height - b.y}
                        width={barWidth}
                        height={b.height}
                        fill={`url(#${chartGlossId(chartId)})`}
                        aria-hidden="true"
                        pointerEvents="none"
                        {...rounding}
                      />
                    </g>
                  );
                })}
              </motion.g>
            );
          })}
        </motion.g>
      </AnimatePresence>
    </Group>
  );
}
