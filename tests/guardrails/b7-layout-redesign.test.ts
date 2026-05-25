/**
 * B7 — Layout redesign ratchet.
 *
 *   1. Large-monitor responsiveness: AppShell carries the
 *      `2xl:max-w-screen-2xl` + `3xl:max-w-none` cascade so wide
 *      monitors actually use the screen real estate. The `3xl`
 *      breakpoint is registered in tailwind.config.js.
 *   2. LeftAccordionRail primitive exists and meets the contract
 *      the user briefed: quiet (default no-open sections),
 *      click-only expansion (no hover auto-open), orientation-
 *      style organisation of the adjacent table.
 *   3. ListPageShell.Body accepts both `aside` (right rail) and
 *      `leftRail` slots; the rails sit OUTSIDE the table card
 *      via `gap-section` separation, not the legacy
 *      `gap-default` flush positioning.
 *   4. The canonical Controls list mounts a LeftAccordionRail
 *      with at least the Status + Category orientation sections.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('B7 — layout redesign', () => {
    describe('Large-monitor responsiveness', () => {
        const shell = read('src/components/layout/AppShell.tsx');
        const tailwind = read('tailwind.config.js');

        it('AppShell cascades max-width past 7xl on wide monitors', () => {
            expect(shell).toMatch(/max-w-7xl/);
            expect(shell).toMatch(/2xl:max-w-screen-2xl/);
            expect(shell).toMatch(/3xl:max-w-none/);
        });

        it('tailwind.config.js registers the 3xl breakpoint', () => {
            expect(tailwind).toMatch(/['"]3xl['"]:\s*['"]1792px['"]/);
        });
    });

    describe('LeftAccordionRail primitive', () => {
        const src = read('src/components/ui/left-accordion-rail.tsx');

        it('exports the primitive + section type', () => {
            expect(src).toMatch(/export function LeftAccordionRail/);
            expect(src).toMatch(/export interface LeftAccordionRailSection/);
        });

        it('defaults to zero open sections (quiet)', () => {
            // Default state: `new Set(defaultOpenIds ?? [])` — if
            // the consumer doesn't seed it, the rail mounts silent.
            expect(src).toMatch(
                /new Set\(defaultOpenIds \?\? \[\]\)/,
            );
        });

        it('expand is click-only — no hover auto-open', () => {
            // The button toggle handler is `onClick`, not
            // `onMouseEnter` / `onFocus`. The chevron transition
            // is the only motion path.
            expect(src).toMatch(/onClick=\{\(\) => toggle\(section\.id\)\}/);
            expect(src).not.toMatch(/onMouseEnter=\{[\s\S]{0,80}toggle\(/);
            expect(src).not.toMatch(/onFocus=\{[\s\S]{0,80}toggle\(/);
        });

        it('renders aria-expanded + aria-controls (a11y)', () => {
            expect(src).toMatch(/aria-expanded=\{isOpen\}/);
            expect(src).toMatch(/aria-controls=\{contentId\}/);
        });
    });

    describe('ListPageShell.Body accepts both rails + separates them', () => {
        const shell = read('src/components/layout/ListPageShell.tsx');

        it('ListPageShellBodyProps declares leftRail + aside', () => {
            expect(shell).toMatch(/leftRail\?:\s*ReactNode/);
            expect(shell).toMatch(/aside\?:\s*ReactNode/);
        });

        it('rails sit OUTSIDE the table card with `gap-section`', () => {
            // The two-rail body row uses `gap-section`, the
            // generous breathing space — pre-B7 the flush
            // `gap-default` read as "rail embedded into the
            // table area". The rail's wrapper is `flex-shrink-0
            // xl:self-start` so it tracks the body's top.
            expect(shell).toMatch(/gap-section/);
            expect(shell).toMatch(/data-testid="list-page-left-rail"/);
            expect(shell).toMatch(/data-testid="list-page-aside"/);
        });
    });

    describe('Controls list mounts a Risks-parity browse aside (was LeftAccordionRail)', () => {
        // 2026-05-25 — the controls orientation rail moved from a
        // <LeftAccordionRail> on the LEFT (the original B7 wiring)
        // to an <AsidePanel> on the RIGHT, matching the chrome of
        // Risks' AI-assist rail. Status / Type / Owner sections all
        // live inside the new aside; the table-side `Type` column
        // surfaces the same `Control.category` value the rail
        // filters on. The B7 primitive still exists in the codebase
        // and is verified above — this `describe` only re-anchors
        // the Controls page contract.
        const src = read(
            'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
        );

        it('mounts an AsidePanel browse rail (NOT a LeftAccordionRail)', () => {
            expect(src).toMatch(/<AsidePanel\b[\s\S]{0,200}title="Browse"/);
            // The legacy left-rail wiring is gone — the import +
            // the JSX must both disappear so a future "move it back
            // left" PR fails this ratchet loudly.
            expect(src).not.toMatch(/import \{[\s\S]{0,200}LeftAccordionRail/);
            expect(src).not.toMatch(/leftRail=\{orientationRail\}/);
            expect(src).not.toMatch(/<LeftAccordionRail\b/);
        });

        it('threads a composed aside (selection + browse + ai) to EntityListPage', () => {
            // The aside slot now receives a composed React node that
            // stacks selection-summary + browse + AI-assist panels.
            expect(src).toMatch(/aside=\{composedAside\}/);
        });

        it('browse sections include Status, Type, AND Owner', () => {
            // Status is enum-driven (always renders); Type +
            // Owner are data-derived (only render when the snapshot
            // has values). All three wiring branches must be in the
            // source so a future "drop one" PR fails CI. The source
            // shape is `data-rail-section-value={`status:${id}`}` —
            // the regex anchors on the prefix string inside the
            // template literal.
            expect(src).toMatch(/data-rail-section-value=\{`status:/);
            expect(src).toMatch(/data-rail-section-value=\{`type:/);
            expect(src).toMatch(/data-rail-section-value=\{`owner:/);
        });

        it('clicking a rail value routes through filterCtx.set', () => {
            // Type → `category` (the Annex theme is stored on
            // `Control.category` even though the UI label is
            // "Type"). Owner → `ownerUserId`.
            expect(src).toMatch(/filterCtx\.set\(['"]status['"]/);
            expect(src).toMatch(/filterCtx\.set\(['"]category['"]/);
            expect(src).toMatch(/filterCtx\.set\(['"]ownerUserId['"]/);
        });
    });

    describe('Controls AI Assist co-pilot rail (Risks-parity)', () => {
        const src = read(
            'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
        );

        it('mounts AiAssistRail inside an AsidePanel titled "AI Assist"', () => {
            // Mirror of the Risks list rail. Same primitive
            // (`<AiAssistRail>`), same chrome (`<AsidePanel>`),
            // same destination (`/risks/ai`) so the panel reads as
            // ONE shared co-pilot across registers — not a stub.
            expect(src).toMatch(/<AsidePanel\b[\s\S]{0,200}title="AI Assist"/);
            expect(src).toMatch(/<AiAssistRail\b/);
            expect(src).toMatch(/aiHref=\{tenantHref\(['"]\/risks\/ai['"]\)\}/);
        });

        it('defaults to collapsed-to-spine (44px)', () => {
            // The co-pilot is a secondary rail; it should not
            // claim 320px unprompted. Matches the Risks contract.
            expect(src).toMatch(
                /<AsidePanel\b[\s\S]{0,200}title="AI Assist"[\s\S]{0,400}defaultCollapsed/,
            );
        });
    });

    describe('Controls table — `Type` column (Annex theme)', () => {
        const src = read(
            'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
        );

        it('column-visibility list includes Type before Status', () => {
            // Anchor on the assetColumnList-style block — the Type
            // entry must appear before the Status entry so the
            // default-visible column order reads Code · Title · Type
            // · Status.
            const start = src.indexOf('const controlColumnList');
            expect(start).toBeGreaterThan(0);
            const slice = src.slice(start, start + 1200);
            const typeIdx = slice.indexOf("id: 'type'");
            const statusIdx = slice.indexOf("id: 'status'");
            expect(typeIdx).toBeGreaterThan(0);
            expect(statusIdx).toBeGreaterThan(typeIdx);
        });

        it('column def renders Control.category under the header "Type"', () => {
            // `accessorFn: (c) => c.category || ''` + header
            // "Type" — the data field stays `category` (matches
            // the schema + filter-defs), the UI label is "Type"
            // so it lines up with the rail section + the user
            // mental model.
            expect(src).toMatch(
                /id:\s*['"]type['"][\s\S]{0,200}header:\s*['"]Type['"]/,
            );
            expect(src).toMatch(/accessorFn:\s*\(c\)\s*=>\s*c\.category/);
        });
    });
});
