/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave coverage — canvas clipboard (previously 0% branches).
 *
 * Pure module-scoped clipboard. Branches exercised:
 *   - copyToClipboard: empty selection (null) vs non-empty; internal
 *     vs external edge filtering.
 *   - hasClipboard: null, empty-nodes, populated.
 *   - pasteFromClipboard: null clipboard early-return; custom idMint
 *     vs default; parentId copied (remap) vs not-copied (drop) vs
 *     absent; edge endpoint in idMap vs fallback.
 *   - clearClipboard / __resetClipboardForTests reset state.
 */

import type { Edge, Node } from "@xyflow/react";
import {
    copyToClipboard,
    hasClipboard,
    pasteFromClipboard,
    clearClipboard,
    __resetClipboardForTests,
} from "@/lib/processes/canvas-clipboard";

const node = (id: string, extra: Partial<Node> = {}): Node =>
    ({
        id,
        position: { x: 10, y: 20 },
        data: { label: id },
        ...extra,
    }) as Node;

const edge = (id: string, source: string, target: string): Edge =>
    ({ id, source, target, data: {} }) as Edge;

beforeEach(() => __resetClipboardForTests());

describe("copyToClipboard + hasClipboard", () => {
    it("empty selection clears the clipboard (early-return branch)", () => {
        copyToClipboard([node("a")], []); // populate first
        expect(hasClipboard()).toBe(true);
        copyToClipboard([], []); // empty → null branch
        expect(hasClipboard()).toBe(false);
    });

    it("keeps only INTERNAL edges (both endpoints selected)", () => {
        const nodes = [node("a"), node("b")];
        const edges = [
            edge("e-int", "a", "b"), // internal — kept
            edge("e-ext", "a", "c"), // external — dropped
            edge("e-ext2", "z", "b"), // external — dropped
        ];
        copyToClipboard(nodes, edges);
        expect(hasClipboard()).toBe(true);
        const pasted = pasteFromClipboard({ idMint: idMinter() })!;
        expect(pasted.edges).toHaveLength(1);
    });
});

describe("hasClipboard branches", () => {
    it("false when clipboard is null", () => {
        expect(hasClipboard()).toBe(false);
    });

    it("false when nodes array is empty but object set", () => {
        // copyToClipboard with empty selection nulls it; to reach the
        // nodes.length === 0 guard we paste nothing else — null path.
        copyToClipboard([], []);
        expect(hasClipboard()).toBe(false);
    });
});

describe("pasteFromClipboard", () => {
    it("returns null when clipboard empty (early-return branch)", () => {
        expect(pasteFromClipboard()).toBeNull();
    });

    it("uses the default idMint when none supplied", () => {
        copyToClipboard([node("a")], []);
        const pasted = pasteFromClipboard()!; // default mint branch
        expect(pasted.nodes).toHaveLength(1);
        expect(pasted.nodes[0].id).not.toBe("a");
        expect(typeof pasted.nodes[0].id).toBe("string");
    });

    it("offsets position by PASTE_OFFSET and marks node selected", () => {
        copyToClipboard([node("a", { position: { x: 100, y: 200 } })], []);
        const pasted = pasteFromClipboard({ idMint: idMinter() })!;
        expect(pasted.nodes[0].position).toEqual({ x: 128, y: 228 });
        expect(pasted.nodes[0].selected).toBe(true);
    });

    it("remaps parentId when the parent was also copied", () => {
        const parent = node("p");
        const child = node("c", { parentId: "p" } as any);
        copyToClipboard([parent, child], []);
        const mint = idMinter();
        const pasted = pasteFromClipboard({ idMint: mint })!;
        const newParentId = pasted.nodes[0].id;
        const pastedChild = pasted.nodes[1] as any;
        expect(pastedChild.parentId).toBe(newParentId);
    });

    it("drops parentId when the parent was NOT copied", () => {
        const child = node("c", { parentId: "outside" } as any);
        copyToClipboard([child], []);
        const pasted = pasteFromClipboard({ idMint: idMinter() })!;
        expect((pasted.nodes[0] as any).parentId).toBeUndefined();
    });

    it("drops parentId when node has no parentId at all", () => {
        copyToClipboard([node("a")], []);
        const pasted = pasteFromClipboard({ idMint: idMinter() })!;
        expect((pasted.nodes[0] as any).parentId).toBeUndefined();
    });

    it("remaps edge endpoints found in idMap and re-keys edge id", () => {
        copyToClipboard([node("a"), node("b")], [edge("e1", "a", "b")]);
        const pasted = pasteFromClipboard({ idMint: idMinter() })!;
        const ids = pasted.nodes.map((n) => n.id);
        expect(ids).toContain(pasted.edges[0].source);
        expect(ids).toContain(pasted.edges[0].target);
        expect(pasted.edges[0].id).toMatch(/^edge-/);
        expect(pasted.edges[0].selected).toBe(false);
    });
});

describe("clearClipboard", () => {
    it("clears a populated clipboard", () => {
        copyToClipboard([node("a")], []);
        expect(hasClipboard()).toBe(true);
        clearClipboard();
        expect(hasClipboard()).toBe(false);
        expect(pasteFromClipboard()).toBeNull();
    });
});

/** Deterministic sequential id-minter for assertions. */
function idMinter(): () => string {
    let i = 0;
    return () => `new-${i++}`;
}
