"use client";

/**
 * R26-PR-E — ProcessInspector.
 *
 * Right-side property panel for the selected canvas element.
 * Today only NODE properties (label + subtitle) are editable;
 * R26 explicitly deferred edge inspectors + per-control inline
 * editing to future PRs (the constrained-canvas brief from R25).
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
import type { Node } from "@xyflow/react";
import { NODE_TAXONOMY, isProcessNodeKind } from "./node-taxonomy";

export interface ProcessInspectorProps {
    /** Selected node, or null when nothing is selected. */
    node: Node | null;
    /**
     * Called when the user commits a label / subtitle change.
     * The canvas writes the change back into its nodes state.
     */
    onUpdate: (nodeId: string, patch: { label?: string; subtitle?: string | null }) => void;
}

export function ProcessInspector({ node, onUpdate }: ProcessInspectorProps) {
    // Local state mirrors the node's data so the user can type
    // without every keystroke flushing to the canvas state. The
    // mirror commits on blur (or Enter), which is when the canvas
    // actually receives the patch.
    const data = node?.data as
        | { label?: string; subtitle?: string; kind?: unknown }
        | undefined;
    const [label, setLabel] = useState(data?.label ?? "");
    const [subtitle, setSubtitle] = useState(data?.subtitle ?? "");

    // Sync local mirror when the selected node changes.
    useEffect(() => {
        setLabel(data?.label ?? "");
        setSubtitle(data?.subtitle ?? "");
    }, [node?.id, data?.label, data?.subtitle]);

    if (!node) {
        return null;
    }

    const kindMeta = isProcessNodeKind(data?.kind)
        ? NODE_TAXONOMY[data.kind]
        : null;

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
            <p className="text-[10px] text-content-subtle">
                Click off the field or press Enter to save the edit.
            </p>
        </aside>
    );
}
