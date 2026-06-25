/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave coverage — edge-attached control serialisation (previously 0%).
 *
 * Branches exercised in edgeControlsForSave:
 *   - data undefined / controls absent / controls not-an-array → [].
 *   - row with non-string controlKey → filtered out (null).
 *   - label: string present vs absent (falls back to controlKey).
 *   - controlId: string present vs absent (→ null).
 */

import type { Edge } from "@xyflow/react";
import { edgeControlsForSave } from "@/lib/processes/edge-controls";

const edge = (data: unknown): Edge =>
    ({ id: "e1", source: "a", target: "b", data }) as Edge;

describe("edgeControlsForSave", () => {
    it("returns [] when edge.data is undefined", () => {
        expect(edgeControlsForSave({ id: "e", source: "a", target: "b" } as Edge)).toEqual(
            [],
        );
    });

    it("returns [] when controls key is absent", () => {
        expect(edgeControlsForSave(edge({}))).toEqual([]);
    });

    it("returns [] when controls is not an array", () => {
        expect(edgeControlsForSave(edge({ controls: "nope" }))).toEqual([]);
    });

    it("drops rows whose controlKey is not a string", () => {
        const r = edgeControlsForSave(
            edge({ controls: [{ controlKey: 123 }, { label: "x" }] }),
        );
        expect(r).toEqual([]);
    });

    it("maps a full row through with all fields present", () => {
        const r = edgeControlsForSave(
            edge({
                controls: [
                    { controlKey: "AC-1", label: "Access", controlId: "ctl-1" },
                ],
            }),
        );
        expect(r).toEqual([
            {
                controlKey: "AC-1",
                label: "Access",
                controlId: "ctl-1",
                dataJson: null,
            },
        ]);
    });

    it("falls back label → controlKey and controlId → null when absent", () => {
        const r = edgeControlsForSave(
            edge({ controls: [{ controlKey: "AC-2", label: 99, controlId: 7 }] }),
        );
        expect(r).toEqual([
            {
                controlKey: "AC-2",
                label: "AC-2", // non-string label → controlKey fallback
                controlId: null, // non-string controlId → null
                dataJson: null,
            },
        ]);
    });

    it("keeps valid rows and drops invalid ones in one mixed list", () => {
        const r = edgeControlsForSave(
            edge({
                controls: [
                    { controlKey: "OK" },
                    { controlKey: null }, // dropped
                    { controlKey: "OK2", controlId: "c2" },
                ],
            }),
        );
        expect(r.map((x) => x.controlKey)).toEqual(["OK", "OK2"]);
        expect(r[1].controlId).toBe("c2");
    });
});
