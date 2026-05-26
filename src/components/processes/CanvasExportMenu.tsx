"use client";

/**
 * Epic P3-PR-A — Canvas export menu (PNG / SVG).
 *
 * Opens from the document bar's action group. Mounts a Popover
 * trigger button labelled "Export" with two items: "Export as PNG"
 * and "Export as SVG". Each fires the corresponding helper from
 * `src/lib/processes/canvas-export.ts` — the helper handles the
 * download side-effect.
 *
 * Why a Popover (not three side-by-side buttons):
 *   - The document bar is already dense (process selector, name,
 *     undo/redo, save, snap toggle). Adding two more visible
 *     actions costs more real estate than they earn — export is a
 *     low-frequency action.
 *   - One trigger reads as "Export" — the format choice is a
 *     detail, not a separate operation.
 *
 * Loading + error states:
 *   - The export helpers are async (the foreignObject serialisation
 *     takes a tick); the menu sets `busy` while a render is in
 *     flight and disables the trigger so a fat-finger double-click
 *     doesn't kick two downloads.
 *   - On failure we toast.error with the message — the existing
 *     useToast hook gives us the canonical surface.
 */

import { useCallback, useState } from "react";
import type { Node } from "@xyflow/react";
import { Popover } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/hooks";
import {
    attachCanvasPngToEvidence,
    exportCanvasAsPdf,
    exportCanvasAsPng,
    exportCanvasAsSvg,
} from "@/lib/processes/canvas-export";

export function CanvasExportMenu({
    canvasEl,
    nodes,
    mapName,
    tenantSlug,
    mapId,
    disabled,
}: {
    /**
     * The `[data-process-canvas="true"]` wrapper element. The
     * helper walks down to the xyflow viewport child. Null when
     * the canvas isn't mounted (empty state, loading); the menu
     * disables itself.
     */
    canvasEl: HTMLElement | null;
    /** Live nodes — used to compute the fit-to-content viewport. */
    nodes: Node[];
    /** Display name of the active process map. */
    mapName: string;
    /**
     * Tenant slug + map id — used by the PDF + Evidence helpers
     * (P3-PR-B) to call the server-side routes. Optional: if
     * omitted, only PNG + SVG show in the menu (P3-PR-A scope).
     */
    tenantSlug?: string;
    mapId?: string;
    /** External disable signal (saving / no active map / etc.). */
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    const run = useCallback(
        async (kind: "png" | "svg" | "pdf" | "evidence") => {
            if (!canvasEl) return;
            setBusy(true);
            try {
                if (kind === "png") {
                    await exportCanvasAsPng({ canvasEl, nodes, mapName });
                } else if (kind === "svg") {
                    await exportCanvasAsSvg({ canvasEl, nodes, mapName });
                } else if (kind === "pdf") {
                    if (!tenantSlug || !mapId) {
                        throw new Error("PDF export needs tenantSlug + mapId");
                    }
                    await exportCanvasAsPdf({
                        canvasEl,
                        nodes,
                        mapName,
                        tenantSlug,
                        mapId,
                    });
                } else if (kind === "evidence") {
                    if (!tenantSlug || !mapId) {
                        throw new Error(
                            "Evidence attachment needs tenantSlug + mapId",
                        );
                    }
                    await attachCanvasPngToEvidence({
                        canvasEl,
                        nodes,
                        mapName,
                        tenantSlug,
                        mapId,
                    });
                    toast.success("Process map attached to Evidence.");
                }
                setOpen(false);
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Export failed",
                );
            } finally {
                setBusy(false);
            }
        },
        [canvasEl, nodes, mapName, tenantSlug, mapId, toast],
    );

    const showServerItems = Boolean(tenantSlug && mapId);

    return (
        <Popover
            openPopover={open}
            setOpenPopover={setOpen}
            data-testid="canvas-export-popover"
            content={
                <Popover.Menu aria-label="Export options">
                    <Popover.Item
                        data-testid="canvas-export-png"
                        onClick={() => void run("png")}
                        disabled={busy}
                    >
                        Export as PNG
                    </Popover.Item>
                    <Popover.Item
                        data-testid="canvas-export-svg"
                        onClick={() => void run("svg")}
                        disabled={busy}
                    >
                        Export as SVG
                    </Popover.Item>
                    {showServerItems && (
                        <>
                            <Popover.Separator />
                            <Popover.Item
                                data-testid="canvas-export-pdf"
                                onClick={() => void run("pdf")}
                                disabled={busy}
                            >
                                Export as PDF
                            </Popover.Item>
                            <Popover.Item
                                data-testid="canvas-export-evidence"
                                onClick={() => void run("evidence")}
                                disabled={busy}
                            >
                                Attach to Evidence
                            </Popover.Item>
                        </>
                    )}
                </Popover.Menu>
            }
        >
            <Button
                variant="secondary"
                size="sm"
                disabled={disabled || busy || !canvasEl}
                data-testid="canvas-export-trigger"
                aria-haspopup="menu"
            >
                {busy ? "Exporting…" : "Export"}
            </Button>
        </Popover>
    );
}
