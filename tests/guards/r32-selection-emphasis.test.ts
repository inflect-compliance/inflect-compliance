/**
 * R32-PR5 — Selection-aware emphasis ratchet.
 *
 * The brutal-verdict review's PR 5 ("Connection language elevation")
 * called out four edge-language gaps. R31 closed two (chip-styled
 * edge labels in Bundle 7, hover-state thickening discovered to
 * already exist in R27). R32-PR5 closes the remaining one:
 * selection-aware emphasis.
 *
 * When the user selects a node or edge on the Processes canvas,
 * the rest of the graph dims out so the eye can read *what touches
 * what* at a glance. The emphasis neighbourhood is:
 *
 *   • Selected node — its id + every node connected via a direct
 *     edge hop (in EITHER direction).
 *   • Selected edge — both endpoint node ids.
 *   • Nothing selected — `null` (everything renders normally).
 *
 * The neighbourhood is computed in `PersistedProcessCanvas` and
 * threaded through `<CanvasEmphasisProvider>` so the typed-node
 * + edge renderers consume it via `useCanvasEmphasis()` without
 * prop-drilling. The emphasis is render-only — never mutated into
 * `node.data` (a Save while a node is selected serialises a
 * clean graph).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R32-PR5 — selection-aware emphasis", () => {
    describe("CanvasEmphasisProvider primitive", () => {
        const src = read(
            "src/lib/processes/canvas-emphasis-context.tsx",
        );

        it("exports the provider + reader + classifier", () => {
            expect(src).toMatch(/export function CanvasEmphasisProvider/);
            expect(src).toMatch(/export function useCanvasEmphasis/);
            expect(src).toMatch(/export function classifyForEmphasis/);
        });

        it("classifier returns one of three emphasis classes", () => {
            // `'normal'` outside selection, `'emphasised'` inside
            // the neighbourhood, `'dimmed'` outside it. Locked here
            // so a future refactor can't silently introduce a
            // fourth state without ratchet update.
            for (const c of ["normal", "emphasised", "dimmed"]) {
                expect(src).toMatch(new RegExp(`["']${c}["']`));
            }
        });

        it("provider default value is no-op (null emphasisIds)", () => {
            // Renderers outside the provider degrade gracefully —
            // useful for rendered tests that mount a single node
            // without standing up the provider.
            expect(src).toMatch(/emphasisIds:\s*null/);
        });
    });

    describe("PersistedProcessCanvas — neighbourhood derivation + provider mount", () => {
        const src = read(
            "src/components/processes/PersistedProcessCanvas.tsx",
        );

        it("imports the provider", () => {
            expect(src).toMatch(
                /import\s*\{\s*CanvasEmphasisProvider\s*\}\s*from\s*["']@\/lib\/processes\/canvas-emphasis-context["']/,
            );
        });

        it("derives the emphasis set from selectedNode + selectedEdge", () => {
            // The selected-node branch walks edges in BOTH
            // directions; the selected-edge branch takes both
            // endpoints. Anchor on the canonical add-neighbour
            // arithmetic so a refactor that drops one direction
            // fails CI loudly.
            expect(src).toMatch(/emphasisIds:\s*ReadonlySet<string>\s*\|\s*null/);
            expect(src).toMatch(
                /e\.source === selectedNode\.id[\s\S]{0,80}ids\.add\(e\.target\)/,
            );
            expect(src).toMatch(
                /e\.target === selectedNode\.id[\s\S]{0,80}ids\.add\(e\.source\)/,
            );
            expect(src).toMatch(
                /selectedEdge[\s\S]{0,400}new Set<string>\(\[selectedEdge\.source,\s*selectedEdge\.target\]\)/,
            );
        });

        it("mounts the provider wrapping the canvas subtree", () => {
            expect(src).toMatch(
                /<CanvasEmphasisProvider\s+emphasisIds=\{emphasisIds\}>/,
            );
            expect(src).toMatch(/<\/CanvasEmphasisProvider>/);
        });
    });

    describe("ProcessTypedNode — consumes emphasis", () => {
        const src = read("src/components/processes/ProcessTypedNode.tsx");

        it("imports the context reader + classifier", () => {
            // Multi-line + trailing-comma tolerant.
            expect(src).toMatch(
                /import\s*\{[\s\S]{0,200}classifyForEmphasis[\s\S]{0,80}useCanvasEmphasis[\s\S]{0,80}\}\s*from\s*["']@\/lib\/processes\/canvas-emphasis-context["']/,
            );
        });

        it("reads the node id from props + classifies against the emphasis set", () => {
            // Anchor on the destructure that includes `id,` and
            // then `NodeProps` shortly after. The actual signature
            // is `function ProcessTypedNodeImpl({ id, data,
            // selected }: NodeProps)`.
            expect(src).toMatch(
                /function ProcessTypedNodeImpl\([\s\S]{0,200}id,[\s\S]{0,200}NodeProps/,
            );
            expect(src).toMatch(/classifyForEmphasis\(id,\s*emphasisIds\)/);
        });

        it("applies opacity-50 on dimmed nodes (both renderer branches)", () => {
            // The dim style threads into BOTH the group branch AND
            // the rect chassis. A refactor that wires it to one
            // branch would silently break the other; anchor on
            // both mount points.
            const emphasisStyleMatches = src.match(
                /["']opacity-50["']/g,
            );
            expect(emphasisStyleMatches).not.toBeNull();
            // Each rendered branch carries the `data-process-node-
            // emphasis` attribute — two occurrences total.
            const attrMatches =
                src.match(/data-process-node-emphasis=\{emphasisClass\}/g) ??
                [];
            expect(attrMatches.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("ProcessEdge — consumes emphasis", () => {
        const src = read("src/components/processes/ProcessEdge.tsx");

        it("imports the context reader", () => {
            expect(src).toMatch(
                /import\s*\{\s*useCanvasEmphasis\s*\}\s*from\s*["']@\/lib\/processes\/canvas-emphasis-context["']/,
            );
        });

        it("destructures source + target from EdgeProps for the membership check", () => {
            // The dim predicate `(!emphasisIds.has(source) ||
            // !emphasisIds.has(target))` requires both fields.
            expect(src).toMatch(
                /\{\s*\n\s*id,\s*\n\s*source,\s*\n\s*target,/,
            );
        });

        it("dims edges outside the neighbourhood AND respects the selected exception", () => {
            // `selected` edges always render at full opacity even
            // outside the neighbourhood (the user picked them
            // explicitly). Locked here so a refactor can't drop
            // the `!selected` guard.
            expect(src).toMatch(/emphasisIds !== null/);
            expect(src).toMatch(/!selected/);
            expect(src).toMatch(/opacity:\s*0\.3/);
        });
    });
});
