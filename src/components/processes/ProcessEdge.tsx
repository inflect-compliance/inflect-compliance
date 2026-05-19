"use client";

/**
 * R25-PR-D — ProcessEdge + ControlOnEdge overlay.
 *
 * Custom xyflow edge component that:
 *   1. Draws an elegant bezier path between two process steps
 *      (overrides xyflow's default thin grey stroke with a token-
 *      backed border-default colour that reads as IC chrome).
 *   2. Optionally renders a Control overlay at the midpoint of
 *      the edge — a small shield-icon badge that visually belongs
 *      to the connection, not to either of the connected nodes.
 *
 * The control-on-edge treatment is the R25 architectural commit:
 * controls are governance objects placed BETWEEN process steps,
 * not separate nodes hanging in space. Visually distinct from
 * `<ProcessStepNode>` (smaller, badge-like, no handles, no card
 * chrome) so the reading is unambiguous — "this is a control on
 * this connection, not another process step".
 *
 * Data-shape contract:
 *   edge.data.control: { label: string } | undefined
 * When present → the overlay renders. Absent → just the bezier
 * stroke. PR-E's interaction model lets users add/remove the
 * control via a click affordance on the edge.
 */

import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    useReactFlow,
    type EdgeProps,
} from "@xyflow/react";
import { ShieldCheck, ShieldPlus } from "lucide-react";
import { memo, useCallback } from "react";

export interface ProcessEdgeData {
    /** Optional control placed on this connection. PR-E adds/removes it. */
    control?: {
        label: string;
    };
    /**
     * R26-PR-C — when the canvas synthesises a transient "preview"
     * edge during a proximity auto-bind drag, it tags the edge's
     * data with `isPreview: true`. The renderer reads this and
     * draws a dashed, brand-coloured stroke so the user SEES the
     * auto-bind about to commit. The preview is stripped from the
     * edges array on commit / cancellation.
     */
    isPreview?: boolean;
    [key: string]: unknown;
}

function ProcessEdgeImpl(props: EdgeProps) {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        selected,
        data,
    } = props;

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const edgeData = data as ProcessEdgeData | undefined;
    const control = edgeData?.control;
    const { setEdges } = useReactFlow();

    // R25-PR-E — single-click "+ Control" affordance. When an edge
    // is selected AND carries no control, a small inline button
    // appears at the midpoint. Click → mutates this edge's data
    // to add a control with the default label. The constrained
    // model: no inline editing, no naming dialog, no settings
    // panel. Visual-authoring intent only.
    const addControl = useCallback(() => {
        setEdges((eds) =>
            eds.map((edge) =>
                edge.id === id
                    ? {
                          ...edge,
                          data: {
                              ...(edge.data as ProcessEdgeData | undefined),
                              control: { label: "Control" },
                          },
                      }
                    : edge,
            ),
        );
    }, [id, setEdges]);

    const isPreview = edgeData?.isPreview === true;

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                // Token-backed stroke — quiet at rest, emphasised
                // on selected/hover so the connection state is
                // legible without becoming a visual centerpiece.
                //
                // R26-PR-C — when this edge is a transient
                // proximity preview, swap to a dashed brand-default
                // stroke. The dash reads unambiguously as "not yet
                // committed"; the brand colour matches the colour
                // a selected edge takes on so the preview reads as
                // a "selected-feeling" outline the user is steering.
                style={{
                    stroke:
                        isPreview || selected
                            ? "var(--brand-default)"
                            : "var(--border-default)",
                    strokeWidth: selected ? 2 : isPreview ? 2 : 1.5,
                    strokeDasharray: isPreview ? "6 4" : undefined,
                }}
            />
            {control && (
                // EdgeLabelRenderer pulls the overlay OUT of the SVG
                // and into a portal-like positioned div so React
                // components (with tokens, hover states, focus
                // rings) can render natively at the edge midpoint.
                // pointer-events: all so the badge is interactive
                // without breaking edge selection.
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: "all",
                        }}
                        className="nodrag nopan"
                        data-control-on-edge="true"
                    >
                        <ControlOnEdge label={control.label} />
                    </div>
                </EdgeLabelRenderer>
            )}
            {!control && selected && (
                // R25-PR-E — affordance only appears when the user
                // has SELECTED an edge that doesn't yet carry a
                // control. This keeps the canvas calm at rest;
                // affordance is contextual, not always-on.
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: "all",
                        }}
                        className="nodrag nopan"
                        data-add-control-affordance="true"
                    >
                        <button
                            type="button"
                            onClick={addControl}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-border-emphasis bg-bg-default px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-emphasis hover:bg-bg-muted transition-colors"
                        >
                            <ShieldPlus className="h-3 w-3 shrink-0 text-[color:var(--brand-default)]" />
                            <span>Add control</span>
                        </button>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export const ProcessEdge = memo(ProcessEdgeImpl);

/**
 * Canonical xyflow edge-type key.
 */
export const PROCESS_EDGE_TYPE = "processEdge";

/**
 * R25-PR-D — ControlOnEdge.
 *
 * Visual representation of a control inserted into a process
 * connection. Deliberately distinct from `<ProcessStepNode>`:
 *
 *   - Smaller (pill, not card) — controls are decorations on
 *     edges, not first-class process objects
 *   - Shield-check icon prefix — governance vocabulary that
 *     reads as "this is a control"
 *   - No handles — controls don't connect to anything, they
 *     decorate the connection itself
 *   - Token-backed tint (bg-bg-elevated + border-emphasis) so
 *     it reads as elevated above the bezier stroke
 *
 * PR-E adds the click-to-add-control affordance and the inline
 * editing UI.
 */
interface ControlOnEdgeProps {
    label: string;
}

export function ControlOnEdge({ label }: ControlOnEdgeProps) {
    return (
        <div
            className="inline-flex items-center gap-1 rounded-[8px] border border-border-emphasis bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-emphasis "
            data-control-on-edge-badge="true"
        >
            <ShieldCheck className="h-3 w-3 shrink-0 text-[color:var(--brand-default)]" />
            <span className="max-w-trunc-tight truncate">{label}</span>
        </div>
    );
}
