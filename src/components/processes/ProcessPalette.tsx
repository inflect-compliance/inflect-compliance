"use client";

/**
 * R25-PR-B — ProcessPalette.
 *
 * Slim top toolbar that ships draggable process-step "stamps".
 * Each stamp is an HTML5-draggable element; dragging onto the
 * canvas drops a new node at the cursor position (the canvas
 * handles the `onDrop` and converts screen → flow coordinates).
 *
 * One palette item for now ("Process step"). PR-C adds shape
 * variants (Decision diamond, Subprocess rectangle, etc.); PR-D
 * adds the control-onto-edge affordance which renders inline on
 * hover of an edge, not in this palette.
 *
 * Design discipline (per the R25 brief): the palette is
 * RESTRAINED — slim, top-oriented, the canvas dominates. The
 * palette must never grow into a sidebar; an oversized palette
 * compromises the Alteryx layout language R25 commits to.
 */

import { GitBranch } from "lucide-react";
import type { DragEvent } from "react";

/**
 * Canonical drag-data mime type for palette → canvas transfers.
 * The canvas reads this on `onDrop` to identify palette payloads
 * (vs unrelated drag sources like file uploads).
 */
export const PALETTE_DRAG_MIME = "application/x-inflect-process-step";

interface PaletteItem {
    /** Stable id for selectors. */
    id: string;
    /** Label that becomes the node's `data.label` on drop. */
    label: string;
}

const PALETTE_ITEMS: ReadonlyArray<PaletteItem> = [
    {
        id: "process-step",
        label: "Process step",
    },
];

export function ProcessPalette() {
    const onDragStart = (event: DragEvent<HTMLDivElement>, label: string) => {
        event.dataTransfer.setData(PALETTE_DRAG_MIME, label);
        event.dataTransfer.effectAllowed = "move";
    };

    return (
        <div
            className="flex items-center gap-tight px-3 py-2"
            data-process-palette="true"
        >
            <span className="text-xs uppercase tracking-wide text-content-muted mr-2">
                Palette
            </span>
            {PALETTE_ITEMS.map((item) => (
                <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => onDragStart(e, item.label)}
                    data-palette-item={item.id}
                    className="inline-flex h-8 items-center gap-tight rounded-[8px] border border-border-subtle bg-bg-default/30 px-2.5 text-xs font-medium text-content-emphasis cursor-grab active:cursor-grabbing hover:border-border-emphasis hover:bg-bg-muted transition-colors"
                >
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                </div>
            ))}
        </div>
    );
}
