/**
 * Activity-feed detail sanitiser — the control/task side-panel "Activity" tab
 * must read as narrative ONLY: no `Context: {json}` suffix, no raw change-dump,
 * no bare identifier tokens. Locks the cases observed in the live feed.
 */
import { humanizeDetail } from "@/app/t/[tenantSlug]/(app)/controls/PanelActivityFeed";

describe("humanizeDetail", () => {
    it("drops a bare owner assignment (only a raw cuid) to nothing", () => {
        const raw =
            'Owner set to: cmq12y4yd000801lh22gkqwgj Context: {"requestId":"b1a4f382-4c58-484f-a740-55d592c235cb"}';
        expect(humanizeDetail(raw)).toBeNull();
    });

    it("drops a full change-dump JSON detail to nothing", () => {
        const raw =
            '{"name":"Acceptable use","description":"Define rules","intent":null,"category":"ORGANIZATIONAL","frequency":"QUARTERLY"} Context: {"requestId":"8ef2ee13-2e65-4cbc-a8a5-3be7ece7b7e6"}';
        expect(humanizeDetail(raw)).toBeNull();
    });

    it("keeps a genuine human sentence and strips the Context blob", () => {
        const raw =
            'Test completed. Next due: 2026-09-04 Context: {"requestId":"e6778ded-4ddb-4cee-8f77-bc7115c312df","lastTested":"2026-06-04T09:12:04.448Z"}';
        const out = humanizeDetail(raw);
        expect(out).toBe("Test completed. Next due: 2026-09-04");
        expect(out).not.toMatch(/Context|requestId|\{|\}/);
    });

    it("never leaks JSON braces, Context:, or uuid/cuid tokens", () => {
        const samples = [
            'Status changed Context: {"requestId":"e6778ded-4ddb-4cee-8f77-bc7115c312df"}',
            '{"a":1,"b":[2,3]}',
            'linked cmq12y4yd000801lh22gkqwgj to e6778ded-4ddb-4cee-8f77-bc7115c312df',
        ];
        for (const s of samples) {
            const out = humanizeDetail(s) ?? "";
            expect(out).not.toMatch(/[{}\[\]]/);
            expect(out).not.toMatch(/Context:/i);
            expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            expect(out).not.toMatch(/\bc[a-z0-9]{20,}\b/i);
        }
    });

    it("returns null for empty/whitespace/nullish input", () => {
        expect(humanizeDetail(null)).toBeNull();
        expect(humanizeDetail(undefined)).toBeNull();
        expect(humanizeDetail("   ")).toBeNull();
    });
});
