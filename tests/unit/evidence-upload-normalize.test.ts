/**
 * Evidence-tab list normaliser — merges the `{ evidence, links }` GET payload
 * into one clean, render-ready list. Locks the two production bugs:
 *   - the control upload writes BOTH an Evidence row AND a ControlEvidenceLink
 *     FILE bridge for the same file → the bridge must be deduped (no blank,
 *     unclickable "Evidence" row), and
 *   - every emitted item must carry a usable name + a single target.
 */
import { normalizeEvidence } from "@/components/evidence/EvidenceUploadSection";

describe("normalizeEvidence", () => {
    it("dedupes the upload-bridge FILE link against its Evidence row", () => {
        const out = normalizeEvidence({
            evidence: [
                { id: "ev1", title: "soc2-report.pdf", fileName: "soc2-report.pdf", fileRecordId: "file_1", type: "FILE" },
            ],
            links: [
                // The bridge row the upload also writes — same fileId as ev1.
                { id: "lnk1", kind: "FILE", fileId: "file_1", note: "soc2-report.pdf" },
            ],
        });
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ id: "ev1", name: "soc2-report.pdf", downloadId: "file_1" });
        // No blank "Evidence" row, no item without a target.
        expect(out.every((i) => i.name && i.name !== "Evidence")).toBe(true);
    });

    it("maps a FILE evidence row to a download target", () => {
        const [item] = normalizeEvidence({
            evidence: [{ id: "ev1", title: "policy.pdf", fileRecordId: "file_9", type: "FILE" }],
        });
        expect(item).toMatchObject({ name: "policy.pdf", downloadId: "file_9" });
        expect(item.externalUrl).toBeUndefined();
    });

    it("maps a LINK evidence row (url in content) to an external target", () => {
        const [item] = normalizeEvidence({
            evidence: [{ id: "ev2", title: "Trust page", type: "LINK", content: "https://acme.com/trust" }],
        });
        expect(item).toMatchObject({ name: "Trust page", externalUrl: "https://acme.com/trust" });
        expect(item.downloadId).toBeUndefined();
    });

    it("renders a standalone FILE link (no Evidence row) as downloadable", () => {
        const [item] = normalizeEvidence({
            links: [{ id: "lnk2", kind: "FILE", fileId: "file_x", note: "audit.zip" }],
        });
        expect(item).toMatchObject({ name: "audit.zip", downloadId: "file_x" });
    });

    it("renders a URL link and names it from the URL when no note", () => {
        const [item] = normalizeEvidence({
            links: [{ id: "lnk3", kind: "LINK", url: "https://acme.com/docs/report.pdf" }],
        });
        expect(item).toMatchObject({ externalUrl: "https://acme.com/docs/report.pdf", name: "report.pdf" });
    });

    it("drops FILE links with no fileId and INTEGRATION_RESULT rows", () => {
        const out = normalizeEvidence({
            links: [
                { id: "a", kind: "FILE", fileId: null },
                { id: "b", kind: "INTEGRATION_RESULT", integrationResultId: "ir1" } as never,
            ],
        });
        expect(out).toHaveLength(0);
    });

    it("never emits a blank 'Evidence' fallback name", () => {
        const out = normalizeEvidence({
            evidence: [{ id: "ev", fileRecordId: "f", type: "FILE" }], // no title/fileName
            links: [{ id: "l", kind: "FILE", fileId: "f2" }], // no note
        });
        expect(out.map((i) => i.name)).toEqual(["Attached file", "Attached file"]);
        expect(out).not.toContainEqual(expect.objectContaining({ name: "Evidence" }));
    });
});
