/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave coverage — edge-attached control serialisation (previously 0%).
 *
 * Branches exercised in edgeControlsForSave:
 *   - data undefined / controls absent / controls not-an-array → [].
 *   - row with non-string controlKey → filtered out.
 *   - label: string present vs absent (falls back to controlKey).
 *   - PR-D: controlId is REQUIRED — a row without a real string controlId
 *     is dropped (never persisted as a control-shaped row with no linkage).
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

    it("falls back label → controlKey but DROPS a row with a non-string controlId", () => {
        const r = edgeControlsForSave(
            edge({ controls: [{ controlKey: "AC-2", label: 99, controlId: 7 }] }),
        );
        // PR-D — controlId 7 is not a real Control id → the row is dropped.
        expect(r).toEqual([]);
    });

    it("drops a row with no controlId, keeping only real-linked controls", () => {
        const r = edgeControlsForSave(
            edge({
                controls: [
                    { controlKey: "OK" }, // no controlId → dropped
                    { controlKey: null }, // bad key → dropped
                    { controlKey: "OK2", controlId: "c2" },
                ],
            }),
        );
        expect(r.map((x) => x.controlKey)).toEqual(["OK2"]);
        expect(r[0].controlId).toBe("c2");
    });

    it("drops a row whose controlId is an empty string", () => {
        const r = edgeControlsForSave(
            edge({ controls: [{ controlKey: "AC-3", controlId: "" }] }),
        );
        expect(r).toEqual([]);
    });
});
