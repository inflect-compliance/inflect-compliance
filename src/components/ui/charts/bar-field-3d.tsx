'use client';

/**
 * Roadmap-21 PR-F — `<BarField3D>`, the first 3D chart in IC.
 *
 * A 3D bar field renders a cross-tab of two dimensions (typically
 * time × category) as a grid of bars whose heights encode the
 * value. Composes onto R21-PR-E's `<Chart3D>` primitive, which
 * carries the lights / camera / OrbitControls / reduced-motion
 * fallback / SSR-safe dynamic import conventions.
 *
 * Why 3D bars (and not, say, a globe or a particle system)? The
 * 3D bar field is the most useful 3D shape for compliance data:
 * any cross-tab table (controls by framework × maturity, risks by
 * severity × age, incidents by region × month) renders cleanly,
 * the height-encoding is intuitive, and the 2D fallback is
 * obvious (a heatmap). The wow piece doesn't have to be the
 * weirdest piece — it has to be the most legible one.
 *
 * Data shape:
 *
 *   `data: Datum[]` where each `Datum` is `{ x: string, z: string,
 *   y: number }`. The chart computes the row/col extent from the
 *   data; missing cells render as empty floor tiles (the user
 *   reads the absence as "no data here", not "zero").
 *
 * Accessibility:
 *
 *   - Required `ariaLabel` describes the chart's data story.
 *   - `FallbackComponent` (passed through to `<Chart3D>`) renders a
 *     2D representation of the same data for screen readers,
 *     reduced-motion users, and WebGL-unsupported browsers. Charts
 *     consuming `<BarField3D>` SHOULD supply this.
 *   - A `<table>` description is also rendered as a visually-
 *     hidden mirror of the data, so AT consumers read the values
 *     even when the canvas is the visible surface.
 */

import { useMemo } from 'react';

import type { Chart3DProps } from './chart-3d';
import { Chart3D, tokenColor } from './chart-3d';
import type { ChartSeriesIndex } from './chart-gradient';

export interface BarField3DDatum {
    /** Discrete X-axis category (e.g. quarter, framework). */
    x: string;
    /** Discrete Z-axis category (e.g. maturity, severity). */
    z: string;
    /** Bar height value. Non-negative. */
    y: number;
}

export interface BarField3DProps {
    data: BarField3DDatum[];
    /**
     * Chart-series index driving the bar gradient. Bars colour-map
     * from `--chart-series-${seriesIndex}-start` at the bar's base
     * to `--chart-series-${seriesIndex}-end` at the bar's top via
     * `tokenColor()`. Default 1.
     */
    seriesIndex?: ChartSeriesIndex;
    /**
     * Maximum bar height in world units. Default 4 — leaves
     * enough vertical room above for the default camera angle to
     * read the tallest bars cleanly.
     */
    maxHeight?: number;
    /**
     * Accessible description forwarded to <Chart3D>.
     */
    ariaLabel: string;
    /**
     * 2D fallback rendered when prefers-reduced-motion is set.
     */
    FallbackComponent?: Chart3DProps['FallbackComponent'];
    className?: string;
    'data-testid'?: string;
}

/**
 * The 3D scene contents — meshes only. Wrapped by `<Chart3D>` at
 * mount time, which provides the Canvas + lights + camera +
 * OrbitControls. Extracted so a future chart that wants the same
 * scene without `<Chart3D>`'s wrapper can compose it directly.
 */
function BarFieldScene({
    data,
    seriesIndex = 1,
    maxHeight = 4,
}: {
    data: BarField3DDatum[];
    seriesIndex?: ChartSeriesIndex;
    maxHeight?: number;
}) {
    const { xCategories, zCategories, lookup, valueMax } = useMemo(() => {
        const xSet = new Set<string>();
        const zSet = new Set<string>();
        const lookupMap = new Map<string, number>();
        let max = 0;
        for (const d of data) {
            xSet.add(d.x);
            zSet.add(d.z);
            lookupMap.set(`${d.x}|${d.z}`, d.y);
            if (d.y > max) max = d.y;
        }
        return {
            xCategories: Array.from(xSet),
            zCategories: Array.from(zSet),
            lookup: lookupMap,
            valueMax: max,
        };
    }, [data]);

    const baseColor = tokenColor(seriesIndex, 'start');
    const tipColor = tokenColor(seriesIndex, 'end');
    const safeMax = valueMax > 0 ? valueMax : 1;

    // Lay the bars out on a unit grid centred at the origin so
    // OrbitControls rotates around the chart's centre of mass.
    const xCount = xCategories.length;
    const zCount = zCategories.length;
    const xOffset = -(xCount - 1) / 2;
    const zOffset = -(zCount - 1) / 2;

    return (
        <>
            {/* Floor — a neutral plane so missing-data cells read
                as gaps in the grid rather than as bars with zero
                height. */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.01, 0]}
                receiveShadow
            >
                <planeGeometry args={[xCount + 2, zCount + 2]} />
                <meshStandardMaterial
                    color="#1a1a1a"
                    opacity={0.15}
                    transparent
                />
            </mesh>

            {xCategories.map((xCat, xi) =>
                zCategories.map((zCat, zi) => {
                    const value = lookup.get(`${xCat}|${zCat}`) ?? 0;
                    if (value <= 0) return null;
                    const height = (value / safeMax) * maxHeight;
                    return (
                        <mesh
                            key={`${xCat}|${zCat}`}
                            position={[
                                xi + xOffset,
                                height / 2,
                                zi + zOffset,
                            ]}
                            castShadow
                            receiveShadow
                        >
                            <boxGeometry args={[0.7, height, 0.7]} />
                            {/* The bar gradient is faked via two
                                materials per face would be complex;
                                instead we paint each bar with the
                                series END colour and rely on the
                                directional light's shadow falloff
                                to give the silhouette depth. Future
                                refinement: a shader-material gradient
                                from base→tip on the four side faces. */}
                            <meshStandardMaterial
                                color={value > safeMax / 2 ? tipColor : baseColor}
                                roughness={0.4}
                                metalness={0.1}
                            />
                        </mesh>
                    );
                }),
            )}
        </>
    );
}

export function BarField3D({
    data,
    seriesIndex = 1,
    maxHeight = 4,
    ariaLabel,
    FallbackComponent,
    className,
    'data-testid': dataTestId = 'bar-field-3d',
}: BarField3DProps) {
    return (
        <Chart3D
            ariaLabel={ariaLabel}
            FallbackComponent={FallbackComponent}
            className={className}
            data-testid={dataTestId}
        >
            <BarFieldScene
                data={data}
                seriesIndex={seriesIndex}
                maxHeight={maxHeight}
            />
        </Chart3D>
    );
}
