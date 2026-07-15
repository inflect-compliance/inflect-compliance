/**
 * PR-D — edge-control render contract (retargeted from the R25
 * "pre-interaction model" ratchet).
 *
 * History: R25 shipped a constrained canvas where the ONLY way to put a
 * control on an edge was a single-click "+ Add control" affordance that
 * stamped an ephemeral `data.control = { label }`. That label was never
 * persisted — the save serialiser (`lib/processes/edge-controls.ts`) only
 * reads `data.controls` (plural) — so the pill vanished on reload, and the
 * "control" was a label with no link to a real Control row.
 *
 * PR-D reconciled the two shapes onto ONE: ProcessEdge now renders the
 * PERSISTED `data.controls`, each pill resolving its live name/status from
 * the tenant control list, and controls are attached via the inspector's
 * real Control picker (which writes `data.controls` with a real
 * `controlId`). The ephemeral single-click stamp is gone.
 *
 * This ratchet locks the new contract so a future refactor can't silently
 * reintroduce the ephemeral, never-persisted shape.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const EDGE_PATH = "src/components/processes/ProcessEdge.tsx";

const SRC = fs.readFileSync(path.join(ROOT, EDGE_PATH), "utf8");

describe("PR-D — edge-control render contract", () => {
    describe("Renders the persisted `data.controls` shape", () => {
        it("reads `data.controls` (plural, persisted), not `data.control`", () => {
            // The plural shape is the one the serialiser round-trips. The
            // singular ephemeral field must be gone so a pill can't render
            // without being persisted.
            expect(SRC).toMatch(/edgeData\?\.controls/);
            expect(SRC).not.toMatch(/edgeData\?\.control\b/);
        });

        it("resolves each control's live status from the tenant control list", () => {
            // A pill shows the control's REAL name + status, resolved via
            // findTenantControl against the shared tenant control cache —
            // not a free-typed label with no linkage.
            expect(SRC).toMatch(/findTenantControl\(/);
            expect(SRC).toMatch(/useTenantControls\(/);
        });

        it("no ephemeral single-click stamp of `control: { label }`", () => {
            // The pre-PR-D affordance wrote an unpersisted control. It must
            // not come back.
            expect(SRC).not.toMatch(
                /control:\s*\{\s*label:\s*t\("defaultControlLabel"\)\s*\}/,
            );
            expect(SRC).not.toMatch(/data-add-control-affordance/);
        });

        it("placed controls use the ShieldCheck icon", () => {
            expect(SRC).toMatch(/ShieldCheck/);
        });

        it("pills render at the edge midpoint (labelX/labelY)", () => {
            expect(SRC).toMatch(/translate\(\$\{labelX\}px/);
        });
    });

    describe("Constrained model — explicit absences", () => {
        it("no context-menu wiring (right-click)", () => {
            expect(SRC).not.toMatch(/onEdgeContextMenu/);
            expect(SRC).not.toMatch(/contextMenu/);
        });

        it("no inline label-editing input/dialog inside ProcessEdge", () => {
            // Control labels are not edited inline in the edge component;
            // the inspector owns editing.
            const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
                /\/\/[^\n]*/g,
                "",
            );
            expect(stripped).not.toMatch(/<input\b/);
        });
    });
});
