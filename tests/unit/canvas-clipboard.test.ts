/**
 * Unit tests for the module-scoped canvas clipboard.
 *
 * `copyToClipboard` / `hasClipboard` / `pasteFromClipboard` /
 * `clearClipboard` operate on a module-scope payload. Each test
 * resets that state via `__resetClipboardForTests` so they are
 * order-independent. The functions are pure given the clipboard
 * state, so we assert re-keying, parent remapping, internal-edge
 * remapping, external-edge dropping, and the paste offset.
 */
import type { Edge, Node } from "@xyflow/react";
import {
    __resetClipboardForTests,
    clearClipboard,
    copyToClipboard,
    hasClipboard,
    pasteFromClipboard,
} from "@/lib/processes/canvas-clipboard";

const PASTE_OFFSET = 28;

function node(
    id: string,
    x = 0,
    y = 0,
    extra: Partial<Node> = {},
): Node {
    return {
        id,
        position: { x, y },
        data: { label: id },
        ...extra,
    } as Node;
}

function edge(id: string, source: string, target: string): Edge {
    return { id, source, target, data: {} } as Edge;
}

// Sequential minter so pasted ids are deterministic + assertable.
function sequentialMint(): () => string {
    let i = 0;
    return () => `new-${i++}`;
}

beforeEach(() => {
    __resetClipboardForTests();
});

describe("copyToClipboard / hasClipboard", () => {
    it("starts empty", () => {
        expect(hasClipboard()).toBe(false);
    });

    it("clears the clipboard when copying an empty selection", () => {
        copyToClipboard([node("a")], []);
        expect(hasClipboard()).toBe(true);
        copyToClipboard([], []);
        expect(hasClipboard()).toBe(false);
    });

    it("captures a single selected node", () => {
        copyToClipboard([node("a")], []);
        expect(hasClipboard()).toBe(true);
    });

    it("captures multiple nodes and only INTERNAL edges", () => {
        const nodes = [node("a"), node("b")];
        const edges = [
            edge("e-int", "a", "b"), // both endpoints selected -> internal
            edge("e-ext-out", "a", "outside"), // target outside -> dropped
            edge("e-ext-in", "outside", "b"), // source outside -> dropped
        ];
        copyToClipboard(nodes, edges);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() });
        expect(pasted).not.toBeNull();
        // Only the internal edge survives the copy.
        expect(pasted!.edges).toHaveLength(1);
        expect(pasted!.nodes).toHaveLength(2);
    });

    it("shallow-clones node data so live mutations do not bleed in", () => {
        const live = node("a", 0, 0, { data: { label: "orig" } });
        copyToClipboard([live], []);
        // Mutate the live node's data after copy.
        (live.data as { label: string }).label = "mutated";
        const pasted = pasteFromClipboard({ idMint: sequentialMint() });
        expect((pasted!.nodes[0].data as { label: string }).label).toBe(
            "orig",
        );
    });
});

describe("hasClipboard edge cases", () => {
    it("is false after clearClipboard", () => {
        copyToClipboard([node("a")], []);
        clearClipboard();
        expect(hasClipboard()).toBe(false);
    });
});

describe("pasteFromClipboard", () => {
    it("returns null when the clipboard is empty", () => {
        expect(pasteFromClipboard()).toBeNull();
    });

    it("re-keys every pasted node id", () => {
        copyToClipboard([node("a"), node("b")], []);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        const ids = pasted.nodes.map((n) => n.id);
        expect(ids).toEqual(["new-0", "new-1"]);
        // Original ids are gone.
        expect(ids).not.toContain("a");
        expect(ids).not.toContain("b");
    });

    it("offsets each pasted node position by PASTE_OFFSET", () => {
        copyToClipboard([node("a", 100, 200)], []);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        expect(pasted.nodes[0].position).toEqual({
            x: 100 + PASTE_OFFSET,
            y: 200 + PASTE_OFFSET,
        });
    });

    it("marks pasted nodes selected and edges unselected", () => {
        copyToClipboard([node("a"), node("b")], [edge("e", "a", "b")]);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        expect(pasted.nodes.every((n) => n.selected === true)).toBe(true);
        expect(pasted.edges.every((e) => e.selected === false)).toBe(true);
    });

    it("remaps internal edge endpoints to the new node ids", () => {
        copyToClipboard(
            [node("a"), node("b")],
            [edge("e", "a", "b")],
        );
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        // Node ids minted first: new-0 (a), new-1 (b); then edge id new-2.
        const [a2, b2] = pasted.nodes.map((n) => n.id);
        expect(pasted.edges[0].source).toBe(a2);
        expect(pasted.edges[0].target).toBe(b2);
        expect(pasted.edges[0].id).toBe("edge-new-2");
    });

    it("remaps parentId when the parent was also copied", () => {
        const parent = node("p");
        const child = node("c", 0, 0, { parentId: "p" } as Partial<Node>);
        copyToClipboard([parent, child], []);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        const newParentId = pasted.nodes[0].id; // "new-0" for parent "p"
        const pastedChild = pasted.nodes[1] as Node & { parentId?: string };
        expect(pastedChild.parentId).toBe(newParentId);
    });

    it("drops parentId when the parent was NOT copied", () => {
        const child = node("c", 0, 0, {
            parentId: "outside",
        } as Partial<Node>);
        copyToClipboard([child], []);
        const pasted = pasteFromClipboard({ idMint: sequentialMint() })!;
        const pastedChild = pasted.nodes[0] as Node & { parentId?: string };
        expect(pastedChild.parentId).toBeUndefined();
    });

    it("produces two non-clobbering copies when pasting twice with one continuous minter", () => {
        copyToClipboard([node("a"), node("b")], [edge("e", "a", "b")]);
        // A SINGLE continuous minter across both pastes -> distinct ids.
        const mint = sequentialMint();
        const first = pasteFromClipboard({ idMint: mint })!;
        const second = pasteFromClipboard({ idMint: mint })!;
        // Two independent pastes produce two copies, not a clobber.
        expect(first.nodes[0].id).not.toBe(second.nodes[0].id);
    });

    it("uses the default id minter when none is supplied", () => {
        copyToClipboard([node("a"), node("b")], [edge("e", "a", "b")]);
        const pasted = pasteFromClipboard()!;
        // Default ids are non-empty, unique, and prefixed.
        const [id0, id1] = pasted.nodes.map((n) => n.id);
        expect(id0).toMatch(/^n-/);
        expect(id1).toMatch(/^n-/);
        expect(id0).not.toBe(id1);
        expect(pasted.edges[0].id).toMatch(/^edge-/);
    });

    it("produces two distinct copies when pasting the same selection twice", () => {
        copyToClipboard([node("a")], []);
        const a = pasteFromClipboard({ idMint: sequentialMint() })!;
        const b = pasteFromClipboard({ idMint: sequentialMint() })!;
        expect(a.nodes[0].id).not.toBe("a");
        expect(b.nodes[0].id).not.toBe("a");
        // Independent paste payloads.
        expect(a).not.toBe(b);
    });
});

describe("clearClipboard / __resetClipboardForTests", () => {
    it("paste returns null after clearClipboard", () => {
        copyToClipboard([node("a")], []);
        clearClipboard();
        expect(pasteFromClipboard({ idMint: sequentialMint() })).toBeNull();
    });

    it("__resetClipboardForTests empties the clipboard", () => {
        copyToClipboard([node("a")], []);
        __resetClipboardForTests();
        expect(hasClipboard()).toBe(false);
        expect(pasteFromClipboard()).toBeNull();
    });
});
