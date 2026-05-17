"use client";

/**
 * R25-PR-C — ProcessStepNode.
 *
 * Custom xyflow node that renders a single process step as an IC-
 * card-styled tile. Replaces the default ReactFlow node (which is
 * a generic boxed div) so the canvas reads as native IC, not as a
 * diagram demo.
 *
 * Visual language:
 *   - Compact IC card chassis (border-subtle, slightly elevated
 *     surface, 8px radius matching the R24 chrome family)
 *   - Left handle = input (data target), right handle = output
 *     (data source). Two horizontal handles produce the LEFT-TO-
 *     RIGHT process-flow reading that diagram tools converge on.
 *   - Title (data.label) as the primary content
 *   - Optional subtitle (data.subtitle) for category / role / step
 *     number — kept optional so simple process flows stay clean
 *   - Selected state: brand-emphasis ring (matches the R23
 *     <KpiFilterCard> selected affordance so the canvas + lists
 *     share one selection vocabulary)
 *
 * What the node deliberately does NOT carry:
 *   - Inline action buttons (delete, duplicate, configure). PR-E's
 *     interaction model keeps the canvas constrained — Backspace
 *     deletes via xyflow's default; per-node menus would clutter.
 *   - A status badge. Process steps don't have status in R25's
 *     scope (visual-only, no execution semantics).
 *   - A right-side properties panel. Out of scope per the brief.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@dub/utils";

export interface ProcessStepNodeData {
    /** Primary label. Required. */
    label: string;
    /** Optional secondary line — category, role, step number. */
    subtitle?: string;
    [key: string]: unknown;
}

function ProcessStepNodeImpl({
    data,
    selected,
}: NodeProps) {
    const stepData = data as ProcessStepNodeData;
    return (
        <div
            className={cn(
                // Card chassis — compact density, calm tone. IC card
                // tokens resolve correctly in light + dark themes.
                "min-w-[160px] max-w-[260px] rounded-[8px] border bg-bg-default/80 backdrop-blur-sm",
                "px-3 py-2 transition-colors",
                // Selected state — brand ring + slight surface lift.
                // Matches R23 KpiFilterCard so canvas + list pages
                // share one selection language.
                selected
                    ? "border-[color:var(--brand-default)] ring-2 ring-[color:var(--brand-default)]/40 bg-bg-elevated"
                    : "border-border-subtle hover:border-border-emphasis",
            )}
            data-process-step-node="true"
            data-selected={selected ? "true" : "false"}
        >
            {/* Input handle on the left edge — drag FROM here to
                connect TO another node. */}
            <Handle
                type="target"
                position={Position.Left}
                className="!h-2 !w-2 !border-2 !border-[color:var(--brand-default)] !bg-bg-default"
            />
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-content-emphasis tabular-nums">
                    {stepData.label || "Untitled step"}
                </span>
                {stepData.subtitle && (
                    <span className="text-[10px] uppercase tracking-wide text-content-muted">
                        {stepData.subtitle}
                    </span>
                )}
            </div>
            {/* Output handle on the right edge — drag FROM here to
                connect FROM another node. */}
            <Handle
                type="source"
                position={Position.Right}
                className="!h-2 !w-2 !border-2 !border-[color:var(--brand-default)] !bg-bg-default"
            />
        </div>
    );
}

export const ProcessStepNode = memo(ProcessStepNodeImpl);

/**
 * Canonical xyflow node-type key. Used by ProcessCanvas's
 * `nodeTypes` registration AND by ProcessPalette's drag payload
 * so the canvas knows which node component to mount on drop.
 */
export const PROCESS_STEP_NODE_TYPE = "processStep";
