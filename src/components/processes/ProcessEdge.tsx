"use client";

/**
 * R25-PR-D / R27-PR-B — ProcessEdge + ControlOnEdge overlay.
 *
 * Custom xyflow edge with a token-backed bezier stroke, a three-tier
 * connection LANGUAGE, and an optional edge-mounted Control overlay.
 *
 * Edge variants (R27-PR-B) — a deliberately minimal hierarchy. One
 * line style per meaning; three is the whole vocabulary:
 *
 *   • flow        — SOLID. Normal sequential process flow. The
 *                   default; the spine of the map.
 *   • conditional — DASHED. An optional / branch path — the
 *                   "sometimes taken" route out of a decision.
 *   • reference   — DOTTED. A non-flow informational dependency —
 *                   a step references an asset or an external
 *                   system. It carries meaning, not sequence.
 *
 * The variant rides on `edge.data.variant`, persists through the
 * `edgeKind` column, and is cycled from the edge's selection
 * affordance. A selected edge keeps its dash signature (only the
 * colour + weight lift) so the variant stays legible while active.
 *
 * The control-on-edge treatment is the R25 architectural commit:
 * controls are governance objects placed BETWEEN process steps,
 * not separate nodes hanging in space.
 *
 * Data-shape contract:
 *   edge.data.controls: EdgeControlData[] | undefined — the PERSISTED
 *                       controls on this edge (controlKey + label +
 *                       controlId), round-tripped by the save serialiser
 *                       and attached via the inspector's real Control picker
 *   edge.data.variant:  'flow' | 'conditional' | 'reference' | undefined
 *   edge.data.isPreview: true while a proximity auto-bind is in flight
 */

import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    useReactFlow,
    type EdgeProps,
} from "@xyflow/react";
import { ShieldCheck, Spline } from "lucide-react";
import { memo, useCallback, useMemo, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useCanvasEmphasis } from "@/lib/processes/canvas-emphasis-context";
import { useTenantContext } from "@/lib/tenant-context-provider";
import {
    useTenantControls,
    findTenantControl,
} from "@/lib/processes/use-tenant-controls";

/** Surface-namespace resolver (`useTranslations('automation.edges')`). */
type EdgesTranslate = ReturnType<typeof useTranslations>;

/** The three connection variants. Minimal, meaningful, curated. */
export type ProcessEdgeVariant = "flow" | "conditional" | "reference";

/** Cycle order for the selection affordance. */
export const EDGE_VARIANT_ORDER: ProcessEdgeVariant[] = [
    "flow",
    "conditional",
    "reference",
];

/**
 * i18n factory — the three connection-variant labels + descriptions,
 * resolved through next-intl at render. Consumers (ProcessEdge itself,
 * ProcessInspector) call this with a `t` scoped to `automation.edges`.
 * Shape is unchanged from the pre-i18n `EDGE_VARIANT_META` constant.
 */
export function buildEdgeVariantMeta(
    t: EdgesTranslate,
): Record<ProcessEdgeVariant, { label: string; description: string }> {
    return {
        flow: { label: t("flowLabel"), description: t("flowDescription") },
        conditional: {
            label: t("conditionalLabel"),
            description: t("conditionalDescription"),
        },
        reference: {
            label: t("referenceLabel"),
            description: t("referenceDescription"),
        },
    };
}

/**
 * Runtime guard — `edgeKind` is a free `String` column, so a
 * rehydrated edge may carry a value we don't recognise. Unknown
 * kinds fall back to `flow` at the render boundary.
 */
export function isProcessEdgeVariant(v: unknown): v is ProcessEdgeVariant {
    return v === "flow" || v === "conditional" || v === "reference";
}

/** A real control attached to an edge — mirrors the persisted
 *  ProcessEdgeControl (controlKey + label + FK controlId). */
export interface EdgeControlData {
    controlKey: string;
    label: string;
    controlId: string | null;
}

export interface ProcessEdgeData {
    /**
     * PR-D — real controls attached to this connection. This is the SAME
     * `data.controls` the inspector's picker writes and the save serialiser
     * (lib/processes/edge-controls.ts) persists + rehydrates, so a pill shown
     * here survives a reload. (The prior ephemeral `data.control` singular
     * shape — written by an on-edge "Add control" button but never saved — is
     * gone; controls are added via the inspector's real Control picker.)
     */
    controls?: EdgeControlData[];
    /**
     * R26-PR-C — transient proximity auto-bind preview. Dashed
     * brand stroke; stripped from the edges array on commit.
     */
    isPreview?: boolean;
    /** R27-PR-B — the connection variant. Defaults to `flow`. */
    variant?: ProcessEdgeVariant;
    /** VR-5 — semantic automation edge kind (trigger-flow / condition-pass / …). */
    edgeKind?: string;
    [key: string]: unknown;
}

/**
 * Resolve the SVG stroke style for a (variant, state) pair.
 *
 * Solid / dashed / dotted is the VARIANT's job; colour + weight is
 * the STATE's job. Keeping the dash pattern on the selected state
 * means a highlighted conditional edge still reads as conditional.
 */
function strokeFor(
    variant: ProcessEdgeVariant,
    selected: boolean,
    isPreview: boolean,
): CSSProperties {
    // R32-PR11 — explicit stroke-width hierarchy.
    //   • Preview:  1.5 (dashed, brand-tinted — "in flight")
    //   • Rest:     1.5 (canvas-edge tone)
    //   • Selected: 2.5 (brand tone, ~67% thicker than rest)
    // Pre-R32 the rest/selected gap was 1.75 vs 2.25 — too
    // subtle to read on a dense graph. The new hierarchy is
    // never reversed: rest < preview ≈ rest < selected.
    if (isPreview) {
        return {
            stroke: "var(--brand-default)",
            strokeWidth: 1.5,
            strokeDasharray: "6 4",
        };
    }
    const stroke = selected ? "var(--brand-default)" : "var(--canvas-edge)";
    if (variant === "conditional") {
        return {
            stroke,
            strokeWidth: selected ? 2.5 : 1.5,
            strokeDasharray: "7 5",
        };
    }
    if (variant === "reference") {
        return {
            stroke,
            strokeWidth: selected ? 2.25 : 1.25,
            strokeDasharray: "1 6",
            strokeLinecap: "round",
        };
    }
    // flow — solid.
    return {
        stroke,
        strokeWidth: selected ? 2.5 : 1.5,
    };
}

/**
 * VR-5 — automation edge styling. Each semantic edge kind gets a distinct
 * stroke + label chip so the workflow graph reads without opening any node.
 */
export function buildAutomationEdgeStyle(
    t: EdgesTranslate,
): Record<string, { stroke: string; dash?: string; label: string }> {
    return {
        "trigger-flow": { stroke: "var(--brand-default)", label: "" },
        "condition-pass": { stroke: "var(--content-success)", label: t("autoPass") },
        "condition-fail": { stroke: "var(--content-error)", dash: "6 4", label: t("autoFail") },
        "chain-delay": { stroke: "var(--canvas-edge)", dash: "2 5", label: t("autoChain") },
        "sla-breach": { stroke: "var(--content-warning)", label: t("autoSlaBreach") },
        "sla-pass": { stroke: "var(--content-success)", label: t("autoOnTime") },
    };
}

function ProcessEdgeImpl(props: EdgeProps) {
    const {
        id,
        source,
        target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        selected,
        data,
        label,
    } = props;

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const t = useTranslations("automation.edges");
    const edgeVariantMeta = useMemo(() => buildEdgeVariantMeta(t), [t]);
    const automationEdgeStyle = useMemo(() => buildAutomationEdgeStyle(t), [t]);

    const edgeData = data as ProcessEdgeData | undefined;
    const isPreview = edgeData?.isPreview === true;
    const variant: ProcessEdgeVariant = isProcessEdgeVariant(edgeData?.variant)
        ? edgeData.variant
        : "flow";
    const { setEdges } = useReactFlow();

    // PR-D — render the PERSISTED `data.controls`. This is the shape the
    // inspector's real Control picker writes and the save serialiser
    // (lib/processes/edge-controls.ts) round-trips, so every pill shown here
    // survives a reload. Controls are attached via the inspector's picker
    // (select the edge → pick a real Control), not stamped inline — an
    // auditor sees which edges are controlled, and every visible pill maps to
    // a real Control row.
    const { tenantSlug } = useTenantContext();
    const tenantControls = useTenantControls(tenantSlug, { pollMs: 30000 });
    const edgeControls = useMemo(
        () => (Array.isArray(edgeData?.controls) ? edgeData.controls : []),
        [edgeData?.controls],
    );
    const hasControls = edgeControls.length > 0;

    // R27-PR-B — cycle the connection variant
    // flow → conditional → reference → flow. One affordance, no
    // dialog: visual authoring, consistent with the add-control UX.
    const cycleVariant = useCallback(() => {
        setEdges((eds) =>
            eds.map((edge) => {
                if (edge.id !== id) return edge;
                const cur = (edge.data as ProcessEdgeData | undefined)?.variant;
                const idx = EDGE_VARIANT_ORDER.indexOf(
                    isProcessEdgeVariant(cur) ? cur : "flow",
                );
                const next =
                    EDGE_VARIANT_ORDER[(idx + 1) % EDGE_VARIANT_ORDER.length];
                return {
                    ...edge,
                    data: {
                        ...(edge.data as ProcessEdgeData | undefined),
                        variant: next,
                    },
                };
            }),
        );
    }, [id, setEdges]);

    // R32-PR5 — emphasis dimming for edges. The edge is in the
    // active neighbourhood iff BOTH endpoints are in the
    // selected node's one-hop set (or it's the selected edge
    // itself, in which case xyflow's own `selected` lifts it).
    // Outside the neighbourhood → drop opacity to ~30% so the
    // dimming reads even on the lightest variant (`reference`
    // is dotted and easily lost).
    const { emphasisIds } = useCanvasEmphasis();
    const edgeDimmed =
        emphasisIds !== null &&
        !selected &&
        (!emphasisIds.has(source) || !emphasisIds.has(target));
    // VR-5 — an automation edge kind overrides the variant styling with its
    // semantic stroke + emits a label chip.
    const autoKind =
        typeof edgeData?.edgeKind === "string" ? edgeData.edgeKind : undefined;
    const autoStyle = autoKind ? automationEdgeStyle[autoKind] : undefined;
    const baseStyle: CSSProperties = autoStyle
        ? {
              stroke: autoStyle.stroke,
              strokeWidth: selected ? 2.5 : 1.5,
              ...(autoStyle.dash ? { strokeDasharray: autoStyle.dash } : {}),
          }
        : strokeFor(variant, selected === true, isPreview);
    const edgeStyle: CSSProperties = edgeDimmed
        ? { ...baseStyle, opacity: 0.3 }
        : baseStyle;
    // The automation kind's chip shows when there's no explicit label/control.
    const autoLabel = autoStyle?.label && autoStyle.label.length > 0 ? autoStyle.label : null;

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                // Token-backed stroke — quiet `--canvas-edge` at rest,
                // brand-lifted on selection / preview. Solid / dashed
                // / dotted is the variant's signature. R32-PR5
                // composes the emphasis-dim opacity on top.
                style={edgeStyle}
            />
            {hasControls && (
                // EdgeLabelRenderer pulls the overlay OUT of the SVG
                // so React components render natively at the midpoint.
                // PR-D — one pill per persisted control, stacked so multiple
                // controls on one edge stay legible. Each pill resolves its
                // live name/status from the tenant control list; the saved
                // `label` is the fallback when the control list is still
                // loading or the control was archived out of the list.
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: "all",
                        }}
                        className="nodrag nopan flex flex-col items-center gap-0.5"
                        data-control-on-edge="true"
                    >
                        {edgeControls.map((ec, i) => {
                            const resolved = findTenantControl(
                                tenantControls,
                                ec.controlId,
                            );
                            return (
                                <ControlOnEdge
                                    key={ec.controlKey || `${ec.controlId}-${i}`}
                                    label={
                                        resolved
                                            ? resolved.ref
                                                ? `${resolved.ref} · ${resolved.title}`
                                                : resolved.title
                                            : ec.label
                                    }
                                    status={resolved?.status ?? null}
                                />
                            );
                        })}
                    </div>
                </EdgeLabelRenderer>
            )}
            {!hasControls && typeof label === "string" && label.length > 0 && (
                // R31 Bundle 7 (PR 5 minimum viable) — chip-styled
                // edge label. Pre-R31, the inspector's edge-label
                // edit set `edge.label` but xyflow's default text
                // render for bezier edges renders nothing without
                // a custom mount. This pulls a token-driven chip
                // at the midpoint so labels stay readable when
                // edges overlap (raw text on a dense graph is
                // unreadable). If a control already occupies the
                // midpoint, the label suppresses — the control is
                // the more semantic anchor.
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: "all",
                        }}
                        className="nodrag nopan"
                        data-edge-label-chip="true"
                    >
                        <span className="inline-flex items-center rounded-[4px] border border-canvas-border bg-canvas-frame px-1.5 py-0.5 text-[10px] text-content-muted">
                            {label}
                        </span>
                    </div>
                </EdgeLabelRenderer>
            )}
            {!hasControls &&
                !(typeof label === "string" && label.length > 0) &&
                autoLabel && (
                    // VR-5 — semantic automation edge-kind chip.
                    <EdgeLabelRenderer>
                        <div
                            style={{
                                position: "absolute",
                                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                                pointerEvents: "all",
                            }}
                            className="nodrag nopan"
                            data-edge-kind-chip={autoKind}
                        >
                            <span className="inline-flex items-center rounded-[4px] border border-canvas-border bg-canvas-frame px-1.5 py-0.5 text-[10px] text-content-muted">
                                {autoLabel}
                            </span>
                        </div>
                    </EdgeLabelRenderer>
                )}
            {selected && (
                // R27-PR-B — selection affordances. Sits just above
                // the midpoint when a control badge occupies it, so
                // the two never collide. PR-D retired the inline
                // "Add control" stamp (it wrote an ephemeral,
                // never-persisted label); controls are now attached
                // via the inspector's real Control picker when the
                // edge is selected. The variant cycle stays inline.
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - (hasControls ? 28 : 0)}px)`,
                            pointerEvents: "all",
                        }}
                        className="nodrag nopan flex items-center gap-1"
                        data-edge-affordances="true"
                    >
                        <button
                            type="button"
                            onClick={cycleVariant}
                            title={t("variantTooltip", {
                                description: edgeVariantMeta[variant].description,
                            })}
                            className="inline-flex items-center gap-1 rounded-[8px] border border-canvas-border bg-canvas-frame px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-default transition-colors hover:border-border-emphasis hover:text-content-emphasis"
                            data-edge-variant-affordance="true"
                        >
                            <Spline
                                className="h-3 w-3 shrink-0 text-[color:var(--brand-default)]"
                                aria-hidden="true"
                            />
                            <span>{edgeVariantMeta[variant].label}</span>
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
 * connection. Deliberately distinct from a process node: a small
 * pill, shield-check icon, no handles, elevated tint — it reads as
 * "a control ON this connection", not another step.
 */
interface ControlOnEdgeProps {
    label: string;
    /**
     * PR-D — live control status (e.g. IMPLEMENTED / IN_PROGRESS /
     * NOT_IMPLEMENTED), resolved from the tenant control list. Null when
     * still loading or the control is missing from the list. Drives the
     * icon tone so an auditor can tell a satisfied control from an open one
     * at a glance.
     */
    status?: string | null;
}

/** Map a Control.status to an icon tone class. Green when the control is
 *  demonstrably in place; amber while in progress; muted otherwise. */
function controlStatusTone(status: string | null | undefined): string {
    const s = (status ?? "").toUpperCase();
    if (s === "IMPLEMENTED" || s === "PASSING" || s === "OPERATING") {
        return "text-[color:var(--status-success,var(--brand-default))]";
    }
    if (s === "IN_PROGRESS" || s === "PARTIAL") {
        return "text-[color:var(--status-warning,var(--brand-default))]";
    }
    return "text-[color:var(--brand-default)]";
}

export function ControlOnEdge({ label, status }: ControlOnEdgeProps) {
    // R32-PR12 — chip vocabulary match. Pre-R32 the control pill
    // had a larger radius than the edge-label chip shipped in
    // R31 Bundle 7. Two pills on the same edge with two
    // different radii — every edge-mounted artefact now reads as
    // one consistent shape language. Same bg-canvas-frame as the
    // label chip; the brand-coloured icon is what distinguishes
    // the control affordance. PR-D tints the icon by live status.
    return (
        <div
            className="inline-flex items-center gap-1 rounded-[4px] border border-canvas-border bg-canvas-frame px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-emphasis"
            data-control-on-edge-badge="true"
            data-control-status={status ?? undefined}
        >
            <ShieldCheck className={`h-3 w-3 shrink-0 ${controlStatusTone(status)}`} />
            <span className="max-w-trunc-tight truncate">{label}</span>
        </div>
    );
}
