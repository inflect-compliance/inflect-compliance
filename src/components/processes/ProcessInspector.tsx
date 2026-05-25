"use client";

/**
 * R26-PR-E / R28 — ProcessInspector.
 *
 * Right-side property panel for the selected canvas element.
 * Originally NODE-only (R26-PR-E); R28 extends to EDGES — selecting
 * a connection now opens the same panel with edge-specific fields
 * (label override + the variant cycle: flow / conditional / reference).
 *
 * Why a panel and not an inline popover:
 *   • Inline popovers compete with the canvas surface for focus;
 *     the user's eye has to alternate between "where the node
 *     lives" and "where the popover is". A persistent right
 *     panel anchors the edit affordance in one stable place.
 *   • Multiple edits (e.g. label THEN subtitle) need a
 *     persistent affordance, not a popover that closes on every
 *     blur.
 *
 * Why it's COLLAPSIBLE:
 *   • Authors who already know what they're building shouldn't
 *     have to look at a panel of empty fields. The panel mounts
 *     only when something is selected; selecting nothing
 *     hides it.
 *
 * Empty-state messaging:
 *   • When something IS selected but the kind doesn't carry
 *     editable fields (decision: just a label; annotation: just
 *     text), the panel still mounts so the user sees a
 *     consistent affordance — never a partial-mount that reads
 *     as "is anything happening?"
 */

import { useEffect, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { NODE_TAXONOMY, isProcessNodeKind } from "./node-taxonomy";
import {
    DEFAULT_NODE_SIZE,
    isProcessNodeSize,
    type ProcessNodeSize,
} from "./ProcessTypedNode";
import {
    EDGE_VARIANT_META,
    EDGE_VARIANT_ORDER,
    isProcessEdgeVariant,
    type ProcessEdgeVariant,
} from "./ProcessEdge";

export interface ProcessInspectorProps {
    /** Selected node, or null when nothing is selected. */
    node: Node | null;
    /**
     * R28 — selected edge, or null when nothing is selected. Mutually
     * exclusive with `node` in practice (xyflow lets you multi-select
     * a node + an edge but the canvas only mirrors one slot at a
     * time — node wins if both are set).
     */
    edge?: Edge | null;
    /**
     * Called when the user commits a label / subtitle change.
     * The canvas writes the change back into its nodes state.
     */
    onUpdate: (
        nodeId: string,
        patch: {
            label?: string;
            subtitle?: string | null;
            size?: ProcessNodeSize;
        },
    ) => void;
    /**
     * R28 — commit an edge edit. The canvas applies the patch to
     * the edge's `label` (top-level on xyflow) + `data.variant`.
     */
    onEdgeUpdate?: (
        edgeId: string,
        patch: { label?: string | null; variant?: ProcessEdgeVariant },
    ) => void;
}

export function ProcessInspector({
    node,
    edge = null,
    onUpdate,
    onEdgeUpdate,
}: ProcessInspectorProps) {
    // Local state mirrors the node's data so the user can type
    // without every keystroke flushing to the canvas state. The
    // mirror commits on blur (or Enter), which is when the canvas
    // actually receives the patch.
    const data = node?.data as
        | { label?: string; subtitle?: string; kind?: unknown; size?: unknown }
        | undefined;
    const [label, setLabel] = useState(data?.label ?? "");
    const [subtitle, setSubtitle] = useState(data?.subtitle ?? "");

    // Sync local mirror when the selected node changes.
    useEffect(() => {
        setLabel(data?.label ?? "");
        setSubtitle(data?.subtitle ?? "");
    }, [node?.id, data?.label, data?.subtitle]);

    // R28 — edge-selection mode. Node wins if both are set; the
    // canvas only mirrors one slot at a time but the guard here
    // keeps the rendering deterministic regardless of order.
    if (!node && edge) {
        return <EdgeInspectorBody edge={edge} onEdgeUpdate={onEdgeUpdate} />;
    }

    if (!node) {
        return null;
    }

    const kindMeta = isProcessNodeKind(data?.kind)
        ? NODE_TAXONOMY[data.kind]
        : null;

    const size: ProcessNodeSize = isProcessNodeSize(data?.size)
        ? data.size
        : DEFAULT_NODE_SIZE;

    const commit = () => {
        const trimmedLabel = label.trim();
        const trimmedSubtitle = subtitle.trim();
        onUpdate(node.id, {
            label: trimmedLabel,
            subtitle: trimmedSubtitle === "" ? null : trimmedSubtitle,
        });
    };

    return (
        <aside
            className="flex w-[260px] shrink-0 flex-col gap-default border-l border-canvas-border bg-canvas-frame p-default"
            data-process-inspector="true"
            aria-label="Selected element properties"
        >
            <div className="flex items-center gap-tight">
                <span className="text-xs uppercase tracking-wide text-content-muted">
                    Inspector
                </span>
                {kindMeta && (
                    <span className="text-[10px] text-content-subtle">
                        — {kindMeta.label}
                    </span>
                )}
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-content-muted">
                    Label
                </span>
                <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        }
                    }}
                    className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-xs text-content-emphasis focus:border-border-emphasis focus:outline-none"
                    data-testid="inspector-label-input"
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-content-muted">
                    Subtitle
                </span>
                <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        }
                    }}
                    placeholder="optional"
                    className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-xs text-content-emphasis focus:border-border-emphasis focus:outline-none"
                    data-testid="inspector-subtitle-input"
                />
            </label>
            <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-content-muted">
                    Size
                </span>
                <ToggleGroup
                    size="sm"
                    ariaLabel="Node size"
                    selected={size}
                    options={[
                        { value: "sm", label: "S" },
                        { value: "md", label: "M" },
                        { value: "lg", label: "L" },
                    ]}
                    selectAction={(v) =>
                        onUpdate(node.id, { size: v as ProcessNodeSize })
                    }
                />
            </div>
            <p className="text-[10px] text-content-subtle">
                Click off the field or press Enter to save the edit.
            </p>
        </aside>
    );
}

// ─── R28 — Edge inspector body ─────────────────────────────────────

function EdgeInspectorBody({
    edge,
    onEdgeUpdate,
}: {
    edge: Edge;
    onEdgeUpdate?: ProcessInspectorProps["onEdgeUpdate"];
}) {
    const variantRaw = (edge.data as { variant?: unknown } | undefined)
        ?.variant;
    const variant: ProcessEdgeVariant = isProcessEdgeVariant(variantRaw)
        ? variantRaw
        : "flow";
    const initialLabel =
        typeof edge.label === "string" ? edge.label : "";
    const [label, setLabel] = useState(initialLabel);

    useEffect(() => {
        setLabel(typeof edge.label === "string" ? edge.label : "");
    }, [edge.id, edge.label]);

    const commit = () => {
        if (!onEdgeUpdate) return;
        const trimmed = label.trim();
        onEdgeUpdate(edge.id, { label: trimmed === "" ? null : trimmed });
    };

    return (
        <aside
            className="flex w-[260px] shrink-0 flex-col gap-default border-l border-canvas-border bg-canvas-frame p-default"
            data-process-inspector="true"
            data-inspector-mode="edge"
            aria-label="Selected edge properties"
        >
            <div className="flex items-center gap-tight">
                <span className="text-xs uppercase tracking-wide text-content-muted">
                    Inspector
                </span>
                <span className="text-[10px] text-content-subtle">
                    — Connection
                </span>
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-content-muted">
                    Label
                </span>
                <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        }
                    }}
                    placeholder="optional"
                    className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-xs text-content-emphasis focus:border-border-emphasis focus:outline-none"
                    data-testid="inspector-edge-label-input"
                />
            </label>
            <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-content-muted">
                    Variant
                </span>
                <ToggleGroup
                    size="sm"
                    ariaLabel="Edge variant"
                    selected={variant}
                    options={EDGE_VARIANT_ORDER.map((v) => ({
                        value: v,
                        label: EDGE_VARIANT_META[v].label,
                    }))}
                    selectAction={(v) =>
                        onEdgeUpdate?.(edge.id, {
                            variant: v as ProcessEdgeVariant,
                        })
                    }
                />
                <span className="text-[10px] text-content-subtle">
                    {EDGE_VARIANT_META[variant].description}
                </span>
            </div>
            <p className="text-[10px] text-content-subtle">
                Click off the field or press Enter to save the edit.
            </p>
        </aside>
    );
}
