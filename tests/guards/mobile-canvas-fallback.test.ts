/**
 * Mobile PR-5 — Processes canvas mobile fallback.
 *
 * The xyflow canvas (pan/zoom/drag of a node graph) is unusable on a phone, so
 * below `md` the Processes page renders a read-only LIST of process maps
 * instead of mounting the canvas. Locks that gate + the desktop-only guidance.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Mobile PR-5 — Processes canvas fallback", () => {
    const src = read(
        "src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx",
    );

    it("renders a mobile list instead of the canvas below md", () => {
        expect(src).toMatch(/const belowMd = useIsBelowMd\(\)/);
        expect(src).toMatch(/if \(belowMd\)\s*\{\s*return <ProcessListMobile/);
        expect(src).toMatch(/data-testid="processes-mobile-list"/);
    });

    it("tells the user editing is a desktop affordance", () => {
        expect(src).toMatch(/larger screen|desktop/i);
    });

    it("the canvas (PersistedProcessCanvas) is only in the non-mobile branch", () => {
        // The mobile fallback must NOT mount the heavy canvas.
        const mobileBranch = src.slice(
            src.indexOf("if (belowMd)"),
            src.indexOf("return (", src.indexOf("if (belowMd)")),
        );
        expect(mobileBranch).not.toMatch(/PersistedProcessCanvas/);
    });
});
