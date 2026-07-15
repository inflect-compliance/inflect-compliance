"use client";

/**
 * Epic P2-PR-A — Edge-attached control serialisation helpers.
 *
 * Lives alongside the canvas (rather than inside it) so the
 * R32-PR10 file-size floor on `PersistedProcessCanvas.tsx`
 * (≤1900 lines) keeps holding as the canvas absorbs more feature
 * work. The two helpers are isomorphic — both peel the same shape
 * off `edge.data.controls` — they differ only in what they
 * synthesise for omitted fields (the inspector's
 * `EdgeControlRef` and the wire shape both work, but the wire
 * shape needs a `dataJson: null` slot too).
 */
import type { Edge } from "@xyflow/react";

export interface EdgeControlWire {
    controlKey: string;
    label: string;
    // PR-D — controlId is REQUIRED. ProcessEdgeControl.controlId is NOT NULL
    // with a real FK to Control, so a control-shaped row with no linkage can
    // never be persisted. Any `data.controls` entry lacking a real controlId
    // is dropped here rather than written.
    controlId: string;
    dataJson: null;
}

/**
 * Read the canonical control list off an xyflow edge's
 * `data.controls` for save serialisation. Tolerant of pre-P2
 * edges whose data omits the array. Entries without a real
 * `controlId` are dropped — every persisted edge control links to
 * a live Control row.
 */
export function edgeControlsForSave(e: Edge): EdgeControlWire[] {
    const raw = (e.data as { controls?: unknown } | undefined)?.controls;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((r) => {
            const row = r as {
                controlKey?: unknown;
                label?: unknown;
                controlId?: unknown;
            };
            if (typeof row.controlKey !== "string") return null;
            if (typeof row.controlId !== "string" || row.controlId === "") {
                return null;
            }
            return {
                controlKey: row.controlKey,
                label:
                    typeof row.label === "string" ? row.label : row.controlKey,
                controlId: row.controlId,
                dataJson: null,
            } satisfies EdgeControlWire;
        })
        .filter((r): r is EdgeControlWire => r !== null);
}
